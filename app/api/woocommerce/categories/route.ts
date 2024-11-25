import { NextResponse } from "next/server";
import WooCommerceRestApi from "woocommerce-rest-ts-api";
import { Category } from "@/lib/types";

const api = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: "wc/v3",
  queryStringAuth: false
});

// Add edge runtime configuration
// export const runtime = 'edge';

export async function GET() {
  try {
    // Fetch all categories by setting per_page to a large number
    const response = await api.get("products/categories" as any, {
      per_page: 100, // Adjust this number based on your total categories
      orderby: 'id'
    });
    const categories = response.data as Category[];

    // Build category path map
    const categoryMap = new Map<number, Category>();
    categories.forEach(cat => categoryMap.set(cat.id, cat));

    // Format category names to show hierarchy
    const formattedCategories = categories.map(category => {
      // If it's a root category (no parent), return as is
      if (category.parent === 0) {
        return category;
      }

      // Build the full path
      let currentCat = category;
      const pathParts = [currentCat.name];
      
      while (currentCat.parent !== 0) {
        const parentCat = categoryMap.get(currentCat.parent);
        if (!parentCat) break;
        
        pathParts.unshift(parentCat.name); // Add parent name to start
        currentCat = parentCat;
      }

      // Return category with formatted name
      return {
        ...category,
        name: pathParts.join(" > ")
      };
    });

    return NextResponse.json(formattedCategories);
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}
