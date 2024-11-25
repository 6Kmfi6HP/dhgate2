import WooCommerceRestApi, { ProductsMainParams, WooRestApiEndpoint } from "woocommerce-rest-ts-api";
import { NextResponse } from "next/server";

interface AttributeValue {
  value: string;
  [key: string]: any;
}

interface ProductAttributes {
  [key: string]: AttributeValue[];
}

// Add edge runtime configuration
// export const runtime = 'edge';

const api = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: "wc/v3",
  queryStringAuth: false
});

// Add new helper function for WordPress authentication
async function getWPAuthHeaders() {
  const username = process.env.WORDPRESS_USERNAME;
  const password = process.env.WORDPRESS_APPLICATION_PASSWORD;
  
  if (!username || !password) {
    throw new Error('WordPress credentials not configured');
  }

  // Remove any spaces from the application password
  const cleanPassword = password.replace(/\s+/g, '');
  
  // Use TextEncoder instead of Buffer
  const encoder = new TextEncoder();
  const data = encoder.encode(`${username}:${cleanPassword}`);
  const base64 = btoa(String.fromCharCode.apply(null, Array.from(data)));
  
  return {
    'Authorization': `Basic ${base64}`,
  };
}

async function uploadMediaToWordPress(imageUrl: string) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    const formData = new FormData();
    formData.append('file', blob, 'product-image.jpg');

    const headers = await getWPAuthHeaders();
    console.log('Uploading with headers:', headers); // Debug log

    const uploadResponse = await fetch(`${process.env.WOOCOMMERCE_URL}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: headers,
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Upload response:', {
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        headers: Object.fromEntries(uploadResponse.headers),
        body: errorText
      });
      throw new Error(errorText);
    }

    const imageData = await uploadResponse.json();
    return {
      id: imageData.id,
      src: imageData.source_url
    };
  } catch (error) {
    console.error('Image upload error:', error);
    throw error;
  }
}

// Add helper function to generate SKU
function generateSKU(productTitle: string, variation?: Record<string, string>): string {
  // Create base SKU from product title
  let sku = productTitle
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-') // Replace non-alphanumeric with dash
    .substring(0, 20); // Limit length
    
  // Add variation details if present
  if (variation) {
    sku += '-' + Object.values(variation)
      .map(v => v.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .join('-');
  }
  
  return sku;
}

export async function POST(request: Request) {
  try {
    const { productData, editData } = await request.json();
    
    // Add validation
    if (!productData) {
      throw new Error('Product data is required');
    }

    // 添加超时控制
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 30000);
    });

    // Handle optional images array
    const imagePromises = productData.images ? productData.images.map(uploadMediaToWordPress) : [];
    
    // 使用 Promise.race 来处理超时
    const uploadedImages = await Promise.race([
      Promise.all(imagePromises),
      timeoutPromise
    ]) as Array<{ id: number; src: string }>;

    console.log('Images uploaded successfully:', uploadedImages);

    // Generate base SKU
    const baseSKU = generateSKU(productData.title);

    // Prepare product attributes including specifications
    const attributes = [
      // Add specifications as non-variation attributes
      ...Object.entries(productData.specifications || {}).map(([name, value]) => ({
        name,
        visible: true,
        variation: false,
        options: [value as string]
      })),
      // Add existing variation attributes
      ...Object.entries(productData.attributes || {}).map(([name, values]) => ({
        name,
        visible: true,
        variation: true,
        options: (values as AttributeValue[]).map(v => v.value)
      }))
    ];

    // Prepare product data
    const wcProduct: ProductsMainParams = {
      name: productData.title,
      type: Object.keys(productData.attributes || {}).length > 0 ? 'variable' : 'simple',
      description: generateSpecificationsHtml(productData.specifications) + (editData.description || productData.description || ""),
      sku: baseSKU, // Add base SKU
      ...(Object.keys(productData.attributes || {}).length === 0 ? { regular_price: editData.regular_price } : {}),
      categories: editData.categories,
      tags: editData.tags,
      images: uploadedImages.map(img => ({
        src: img.src
      })),
      attributes: attributes // Use updated attributes array
    };

    // 创建主产品
    const response = await api.post("products", wcProduct);
    const productId = response.data.id;

    // 如果是变体产品，创建变体
    if (wcProduct.type === 'variable') {
      const variations = generateVariations(productData.attributes);
      
      const variationPromises = variations.map(async (variation) => {
        // Generate unique SKU for this variation
        const variationSKU = generateSKU(productData.title, variation);
        
        // Find the image URL from the attributes data
        let variationImage;
        
        // Look through each attribute to find the matching image_url
        for (const [attrName, attrValue] of Object.entries(variation)) {
          const attributeData = productData.attributes[attrName]?.find(
            (attr: AttributeValue) => attr.value === attrValue
          );
          if (attributeData?.image_url) {
            try {
              variationImage = await uploadMediaToWordPress(attributeData.image_url);
              break; // Use the first image found
            } catch (error) {
              console.error('Failed to upload variation image:', error);
            }
          }
        }

        return api.post(`products/${productId}/variations` as WooRestApiEndpoint, {
          regular_price: editData.regular_price,
          sku: variationSKU, // Add variation SKU
          attributes: Object.entries(variation).map(([name, value]) => ({
            name,
            option: value
          })),
          ...(variationImage && {
            image: {
              id: variationImage.id,
              src: variationImage.src
            }
          })
        });
      });

      // Wait for all variations to be created
      await Promise.all(variationPromises);
    }

    // 确保立即返回响应
    return new NextResponse(
      JSON.stringify({ 
        success: true, 
        product: response.data,
        productUrl: `${process.env.WOOCOMMERCE_URL}/wp-admin/post.php?post=${productId}&action=edit`,
        message: 'Product created successfully'
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Error in POST handler:', error);
    
    // 确保错误响应也能立即返回
    return new NextResponse(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

// 辅助函数
function generateSpecificationsHtml(specifications?: Record<string, string>): string {
  if (!specifications || Object.keys(specifications).length === 0) {
    return "";
  }

  const specRows = Object.entries(specifications)
    .map(
      ([key, value]) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; width: 30%;">${key}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${value}</td>
      </tr>
    `
    )
    .join("");

  return `
    <div style="margin-bottom: 20px;">
      <h3 style="margin-bottom: 10px;">Specifications</h3>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
        <tbody>
          ${specRows}
        </tbody>
      </table>
    </div>
  `;
}

function generateVariations(attributes: ProductAttributes): Record<string, string>[] {
  const attributeNames = Object.keys(attributes);
  const combinations: Record<string, string>[] = [];

  function generate(current: Record<string, string>, depth: number) {
    if (depth === attributeNames.length) {
      combinations.push({...current});
      return;
    }

    const currentAttr = attributeNames[depth];
    const values = attributes[currentAttr];

    for (const {value} of values) {
      generate({...current, [currentAttr]: value}, depth + 1);
    }
  }

  generate({}, 0);
  return combinations;
}
