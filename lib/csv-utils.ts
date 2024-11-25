import { Review, ReviewImage, ReviewAttribute } from "@/lib/types";

type AttributeValue = {
  value: string;
  image_url?: string;
};

type PriceInfo = {
  minQuantity: number;
  price: number;
};

export interface ProductData {
  title: string;
  attributes: {
    [key: string]: AttributeValue[];
  };
  priceInfos: PriceInfo[];
  images?: string[];
  description?: string;
  soldCount?: number;
  specifications?: Record<string, string>;
}

type WooCommerceRow = {
  ID: string;
  Type: "variable" | "variation" | "simple";
  SKU: string;
  Name: string;
  Published: string;
  "Is featured?": string;
  "Visibility in catalog": string;
  Description: string;
  "Tax status": string;
  "In stock?": string;
  Stock: string;
  Images: string;
  Parent: string;
  Position: string;
  "Regular price": string;
  [key: string]: string; // For dynamic attribute columns
};

export function convertToWooCommerceCSV(productData: ProductData): string {
  // Generate base headers
  const baseHeaders = [
    "ID",
    "Type",
    "SKU",
    "Name",
    "Published",
    "Is featured?",
    "Visibility in catalog",
    "Description",
    "Tax status",
    "In stock?",
    "Stock",
    "Images",
    "Parent",
    "Position",
    "Regular price",
  ];

  // 先处理原始的 attributes
  //   const originalAttributeEntries = Object.entries(productData.attributes);

  // 再处理 specifications，排除 Category
  const specificationEntries = Object.entries(productData.specifications || {})
    .filter(([key]) => key.toLowerCase() !== "category")
    .map(([key, value]) => [key, [{ value: value, image_url: "" }]]);

  // 合并两种属性
  const combinedAttributes: Record<string, AttributeValue[]> = {
    ...productData.attributes,
    ...Object.fromEntries(specificationEntries),
  };

  // 使用合并后的 attributes 生成 headers
  const attributeEntries = Object.entries(combinedAttributes);
  const isSimpleProduct = Object.keys(productData.attributes).length === 0;

  // Generate attribute headers based on actual attributes
  const attributeHeaders: string[] = [];

  // 根据实际属性数量生成表头
  attributeEntries.forEach((_, index) => {
    const i = index + 1;
    attributeHeaders.push(
      `Attribute ${i} name`,
      `Attribute ${i} value(s)`,
      `Attribute ${i} visible`,
      `Attribute ${i} global`
    );
  });

  const headers = [...baseHeaders, ...attributeHeaders];
  const rows: WooCommerceRow[] = [];
  const basePrice = productData.priceInfos[0]?.price || 0;
  const baseSKU = productData.title.slice(0, 20).replace(/[^a-zA-Z0-9]/g, "");

  // Helper function to escape CSV field
  const escapeCsvField = (field: string): string => {
    if (!field) return '""';
    // 替换所有双引号为两个双引号
    const escaped = field.replace(/"/g, '""');
    // 确保整个字段被双引号包围
    return `"${escaped}"`;
  };

  // Modify parent row for simple product
  const parentRow: WooCommerceRow = {
    ID: "1000",
    Type: isSimpleProduct ? "simple" : "variable",
    SKU: baseSKU,
    Name: productData.title,
    Published: "1",
    "Is featured?": "0",
    "Visibility in catalog": "visible",
    Description: escapeCsvField(
      generateSpecificationsHtml(productData.specifications) +
        (productData.description || "")
    ).slice(1, -1), // 移除外层的双引号，因为 escapeCsvField 会再次添加
    "Tax status": "taxable",
    "In stock?": "1",
    Stock: (productData.soldCount
      ? productData.soldCount * 99
      : 100
    ).toString(),
    Images: productData.images?.map((url) => url.trim()).join(", ") || "",
    Parent: "",
    Position: "0",
    "Regular price": isSimpleProduct ? basePrice.toString() : "",
  };

  // Add attribute data to parent row
  attributeEntries.forEach(
    ([attrName, attrValues]: [string, AttributeValue[]], index) => {
      const i = index + 1;
      parentRow[`Attribute ${i} name`] = attrName;
      parentRow[`Attribute ${i} value(s)`] = attrValues
        .map((av) => av.value)
        .join(", ");

      // 检查这个属性是否来自 specifications
      const isFromSpecifications = !productData.attributes[attrName];
      parentRow[`Attribute ${i} visible`] = "1";
      parentRow[`Attribute ${i} global`] = isFromSpecifications ? "0" : "1";
    }
  );

  rows.push(parentRow);

  // Only generate variations if it's not a simple product
  if (!isSimpleProduct) {
    // Generate all possible combinations of attributes
    const generateVariations = (
      current: { [key: string]: AttributeValue },
      attrIndex: number
    ): void => {
      if (attrIndex >= attributeEntries.length) {
        // Create variation row
        const variationValues = Object.values(current).map(
          (av: AttributeValue) => av
        );
        const variationNames = Object.keys(current);
        const variantSKU = `${baseSKU}-${variationValues
          .map((v) => v.value.replace(/[^a-zA-Z0-9]/g, ""))
          .join("-")}`;

        const variationRow: WooCommerceRow = {
          ID: `${1000 + rows.length}`,
          Type: "variation",
          SKU: variantSKU,
          Name: `${productData.title} - ${variationValues
            .map((v) => v.value)
            .join(" ")}`,
          Published: "1",
          "Is featured?": "0",
          "Visibility in catalog": "visible",
          Description: "",
          "Tax status": "taxable",
          "In stock?": "1",
          Stock: (productData.soldCount
            ? productData.soldCount * 99
            : 100
          ).toString(),
          Images: variationValues[0].image_url || "",
          Parent: "id:1000",
          Position: rows.length.toString(),
          "Regular price": basePrice.toString(),
        };

        // Add attribute data to variation row
        variationNames.forEach((attrName, index) => {
          const i = index + 1;
          variationRow[`Attribute ${i} name`] = attrName;
          variationRow[`Attribute ${i} value(s)`] = current[attrName].value;
          variationRow[`Attribute ${i} visible`] = "1";
          variationRow[`Attribute ${i} global`] = "1";
        });

        rows.push(variationRow);
        return;
      }

      const [attrName, attrValues] = attributeEntries[attrIndex];
      for (const attrValue of attrValues) {
        generateVariations(
          { ...current, [attrName]: attrValue },
          attrIndex + 1
        );
      }
    };

    // Start generating variations
    generateVariations({}, 0);
  }

  // Convert to CSV with proper escaping
  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header] || "";
          return escapeCsvField(value);
        })
        .join(",")
    ),
  ];

  return csvRows.join("\n");
}

// 添加一个辅助函数来生成规格的 HTML
function generateSpecificationsHtml(
  specifications?: Record<string, string>
): string {
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

// Update the convertReviewsToCSV function with proper typing
export function convertReviewsToCSV(reviews: Review[]): string {
  // Define CSV headers
  const headers = [
    "Review ID",
    "Date",
    "Rating",
    "Reviewer",
    "Country",
    "Content",
    "Images",
    "Purchased Variations",
  ];

  // Helper function to escape CSV fields
  const escapeCsvField = (field: string): string => {
    if (!field) return '""';
    const escaped = field.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  // Convert reviews to CSV rows
  const rows = reviews.map((review) =>
    [
      review.id,
      review.dateText,
      review.rating,
      review.buyer.nickname,
      review.buyer.countryName,
      review.content,
      review.images.map((img: ReviewImage) => img.url).join("; "),
      review.attributes
        .map((attr: ReviewAttribute) => `${attr.attrname}: ${attr.attrvalue}`)
        .join("; "),
    ].map((field) => escapeCsvField(String(field)))
  );

  // Combine headers and rows
  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}
