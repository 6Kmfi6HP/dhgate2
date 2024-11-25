import { ProductAttributesFetcher } from '@/components/product-attributes-fetcher';
import { Metadata, ResolvingMetadata } from 'next';
import { headers } from 'next/headers';

// Add edge runtime configuration
export const runtime = 'edge';

interface Props {
  searchParams: { url?: string }
}

async function fetchProductData(url: string) {
  try {
    const headersList = headers();
    const protocol = headersList.get('x-forwarded-proto') || 'http';
    const host = headersList.get('host') || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;
    const response = await fetch(`${baseUrl}/api/attributes?url=${encodeURIComponent(url)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch product data');
    }

    return data;
  } catch (error) {
    console.error('Error fetching product data:', error);
    return null;
  }
}

export async function generateMetadata(
  { searchParams }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const headersList = headers();
  const protocol = headersList.get('x-forwarded-proto') || 'http';
  const host = headersList.get('host') || 'localhost:3000';
  const baseUrl = `${protocol}://${host}`;

  const url = searchParams.url;

  if (!url) {
    return {
      metadataBase: new URL(baseUrl),
      title: {
        absolute: 'Product Attributes Fetcher'
      },
      description: 'Enter a product URL or paste a link to fetch its attributes',
    };
  }

  const productData = await fetchProductData(url);

  if (!productData) {
    return {
      metadataBase: new URL(baseUrl),
      title: {
        absolute: 'Product Attributes Fetcher'
      },
      description: 'Enter a product URL or paste a link to fetch its attributes',
    };
  }

  const description = `${productData.title}. ${productData.specifications?.Brand ? `Brand: ${productData.specifications.Brand}.` : ''
    } ${productData.soldCount ? `${productData.soldCount} sold.` : ''}`.trim();

  return {
    metadataBase: new URL(baseUrl),
    title: {
      absolute: `${productData.title} | Product Attributes Fetcher`
    },
    description,
    openGraph: {
      title: productData.title,
      description,
      images: productData.images?.[0] ? [productData.images[0]] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: productData.title,
      description,
      images: productData.images?.[0] ? [productData.images[0]] : [],
    },
  };
}

export default async function Home({ searchParams }: Props) {
  const url = searchParams.url;
  const initialData = url ? await fetchProductData(url) : null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Product Attributes Fetcher
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Enter a product URL or paste a link to fetch its attributes
          </p>
        </div>
        <ProductAttributesFetcher initialData={initialData} />
      </div>
    </main>
  );
}