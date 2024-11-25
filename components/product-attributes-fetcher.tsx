"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Search, Link as LinkIcon, Package, Download, Eye, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { ProductData, convertToWooCommerceCSV, convertReviewsToCSV } from "@/lib/csv-utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { ImageLightbox } from "@/components/ui/image-lightbox";

import { Review, ReviewImage, ReviewAttribute, RecommendedProduct, ProductEditData } from "@/lib/types";
// import htmlclean from "htmlclean";
import { createProduct } from '@/lib/woocommerce-api';
import { ProductEditDialog } from "@/components/product-edit-dialog";

interface ApiResponse extends ProductData {
  specifications: Record<string, string>;
  reviews?: Review[];
  recommendations?: RecommendedProduct[];
}

export function ProductAttributesFetcher({ initialData }: { initialData: ApiResponse | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [url, setUrl] = useState(searchParams.get("url") || "");
  const [loading, setLoading] = useState(false);
  const [productData, setProductData] = useState<ApiResponse | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showReviewsDialog, setShowReviewsDialog] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedReviewImages, setSelectedReviewImages] = useState<ReviewImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editData, setEditData] = useState<ProductEditData | null>(null);

  const fetchAttributes = async (urlToFetch: string) => {
    if (!urlToFetch) return;

    setLoading(true);
    setError(null);
    setProductData(null);

    try {
      const encodedUrl = encodeURIComponent(urlToFetch);
      const response = await fetch(`/api/attributes?url=${encodedUrl}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch attributes");
      }

      setProductData(data);
      router.push(`?url=${encodedUrl}`, { scroll: false });
      
      toast({
        title: "Success",
        description: "Product attributes fetched successfully",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const urlParam = searchParams.get("url");
    if (urlParam && !initialData) {
      fetchAttributes(urlParam);
    }
  }, [searchParams, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    fetchAttributes(url);
  };

  const handleExport = () => {
    if (!productData) return;

    const csv = convertToWooCommerceCSV({
      title: productData.title,
      attributes: productData.attributes,
      priceInfos: productData.priceInfos,
      images: productData.images,
      description: productData.description,
      soldCount: productData.soldCount,
      specifications: productData.specifications
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${productData.title}-variations.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportReviews = () => {
    if (!productData?.reviews?.length) return;

    const csv = convertReviewsToCSV(productData.reviews);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${productData.title}-reviews.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCSVData = () => {
    if (!productData) return { headers: [], rows: [] };
    
    const csv = convertToWooCommerceCSV({
      title: productData.title,
      attributes: productData.attributes,
      priceInfos: productData.priceInfos,
      images: productData.images,
      description: productData.description,
      soldCount: productData.soldCount,
      specifications: productData.specifications
    });

    // 使用更可靠的 CSV 解析逻辑
    const parseCSVLine = (line: string): string[] => {
      const row: string[] = [];
      let field = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
          if (nextChar === '"') {
            // 处理转义的双引号
            field += '"';
            i++; // 跳过下一个引号
          } else {
            // 切换引号状态
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          // 只在不在引号内时分割字段
          row.push(field);
          field = '';
        } else {
          field += char;
        }
      }
      
      // 添加最后一个字段
      row.push(field);
      
      // 清理每个字段中的首尾引号
      return row.map(field => field.replace(/^"|"$/g, ''));
    };

    // 分割行，但保持引号内的换行符
    const lines: string[] = [];
    let currentLine = '';
    let inQuotes = false;
    
    csv.split('').forEach(char => {
      if (char === '"') {
        inQuotes = !inQuotes;
      }
      if (char === '\n' && !inQuotes) {
        lines.push(currentLine);
        currentLine = '';
      } else {
        currentLine += char;
      }
    });
    if (currentLine) {
      lines.push(currentLine);
    }

    // 解析表头和数据行
    const headers = parseCSVLine(lines[0]);
    const rows = lines.slice(1).map(line => parseCSVLine(line));

    // 对于表格显示，截断过长的内容
    const truncateContent = (content: string, maxLength: number = 100): string => {
      if (content.length <= maxLength) return content;
      return content.substring(0, maxLength) + '...';
    };

    // 处理表格显示的行数据
    const displayRows = rows.map(row => 
      row.map((cell, index) => {
        // 对 Description 列进行特殊处理
        if (headers[index] === 'Description') {
          return truncateContent(cell);
        }
        return cell;
      })
    );

    return { headers, rows: displayRows };
  };

  const handleUploadToWooCommerce = async () => {
    if (!productData) return;
    setShowEditDialog(true);
  };

  const handleEditConfirm = async (editData: ProductEditData) => {
    if (!productData) return;
    
    try {
      setIsUploading(true);
      setShowEditDialog(false);
      const result = await createProduct(productData as ProductData, editData);
      
      toast({
        title: "Success",
        description: (
          <div className="flex flex-col gap-2">
            <p>Product successfully created!</p>
            <a 
              href={result.productUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              View in WooCommerce
            </a>
          </div>
        ),
        duration: 5000,
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create product",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="flex gap-4">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <LinkIcon className="h-5 w-5 text-gray-400" />
          </div>
          <Input
            type="url"
            placeholder="Enter product URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="pl-10"
            required
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Search className="h-4 w-4 mr-2" />
          )}
          Fetch Product
        </Button>
      </form>

      {productData && (
        <div className="flex flex-wrap gap-4">
          <Button onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export to CSV
          </Button>
          
          <Button 
            variant="outline" 
            onClick={() => setShowDialog(true)}
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview CSV Data
          </Button>

          <Button
            onClick={handleUploadToWooCommerce}
            disabled={isUploading}
            variant="default"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload to WooCommerce
              </>
            )}
          </Button>
        </div>
      )}

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 text-red-700">
          {error}
        </Card>
      )}

      {productData && (
        <div className="space-y-8">
          {/* Product Card */}
          <Card className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Product Images */}
              <div className="relative">
                <Carousel className="w-full">
                  <CarouselContent>
                    {productData?.images?.map((image, index) => (
                      <CarouselItem key={index}>
                        <div className="relative aspect-square">
                          <Image
                            src={image}
                            alt={`Product image ${index + 1}`}
                            fill
                            className="object-cover rounded-lg"
                          />
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="absolute left-2 top-1/2 -translate-y-1/2" />
                  <CarouselNext className="absolute right-2 top-1/2 -translate-y-1/2" />
                </Carousel>
              </div>

              {/* Product Info */}
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    {productData.title}
                  </h1>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Package className="h-4 w-4" />
                    <span>{productData.soldCount} sold</span>
                  </div>
                </div>

                {/* Price Information */}
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold">Wholesale Pricing</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {productData.priceInfos.map((price, index) => (
                      <Card key={index} className="p-3">
                        <div className="text-sm">
                          {typeof price.price === 'number' ? (
                            <>
                              <div className="text-green-600 font-medium">
                                US ${price.price.toFixed(2)}
                              </div>
                              <div className="text-gray-600">
                                {price.minQuantity} Piece{price.minQuantity > 1 ? 's' : ''}+
                              </div>
                            </>
                          ) : (
                            <div className="text-gray-500">Price not available</div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Recommended Products - Moved here */}
          {productData?.recommendations && productData.recommendations.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Recommended Products</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {productData.recommendations.map((product, index) => (
                  <div 
                    key={index}
                    className="group relative flex flex-col overflow-hidden rounded-lg border hover:shadow-lg transition-shadow"
                  >
                    <a href={`/?url=${encodeURIComponent(product.url)}`} className="block">
                      <div className="aspect-square relative overflow-hidden bg-gray-100">
                        <Image
                          src={product.image}
                          alt={product.title}
                          fill
                          className="object-cover object-center group-hover:scale-105 transition-transform duration-300"
                        />
                        {product.shipping.free && (
                          <span className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                            Free Shipping
                          </span>
                        )}
                      </div>
                    </a>
                    
                    <div className="flex flex-col p-4">
                      <h4 className="text-sm font-medium line-clamp-2 mb-2 group-hover:text-blue-600">
                        <a href={`/?url=${encodeURIComponent(product.url)}`} rel="noopener noreferrer">
                          {product.title}
                        </a>
                      </h4>
                      
                      <div className="mt-auto space-y-2">
                        <div className="flex items-center gap-1">
                          <span className="text-base font-semibold text-green-600 whitespace-nowrap">
                            {product.price.current.min}
                          </span>
                          {product.price.original.min !== product.price.current.min && (
                            <span className="text-xs text-gray-400 line-through whitespace-nowrap">
                              {product.price.original.min}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <div className="flex items-center gap-1">
                            <span className="text-yellow-400">★</span>
                            <span>{product.rating}</span>
                          </div>
                          <span>{product.orders || 0} sold</span>
                        </div>
                        
                        {product.shipping.xDayArrive > 0 && (
                          <div className="text-xs text-gray-500">
                            Ships in {product.shipping.xDayArrive} days
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Product Attributes */}
          {Object.entries(productData.attributes).map(([attrName, values]) => (
            <Card key={attrName} className="p-6">
              <h3 className="text-lg font-semibold mb-4">{attrName}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {values.map((attr, index) => (
                  <div
                    key={index}
                    className="flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    {attr.image_url && (
                      <div className="relative w-24 h-24 mb-3">
                        <Image
                          src={attr.image_url}
                          alt={attr.value}
                          fill
                          className="object-contain"
                        />
                      </div>
                    )}
                    <span className="text-sm text-center">{attr.value}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          {/* Add Specifications section before Product Description */}
          {productData?.specifications && Object.keys(productData.specifications).length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Specifications</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(productData.specifications).map(([key, value]) => (
                  <div key={key} className="flex items-start space-x-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <div className="min-w-[120px] font-medium text-gray-600 dark:text-gray-300">
                      {key}:
                    </div>
                    <div className="text-gray-800 dark:text-gray-200">{value}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Product Description */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Product Description</h3>
            <div 
              className="prose dark:prose-invert max-w-none break-words"
              dangerouslySetInnerHTML={{ __html: productData.description || '' }}
            />
          </Card>

          {/* Reviews Section */}
          {productData?.reviews && productData.reviews.length > 0 && (
            <Card className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Customer Reviews</h3>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowReviewsDialog(true)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View All Reviews
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={handleExportReviews}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export Reviews
                  </Button>
                </div>
              </div>
              
              <div className="space-y-6">
                {productData.reviews.slice(0, 3).map((review: Review) => (
                  <div key={review.id} className="border-b pb-4 last:border-0">
                    <div className="flex justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="flex">
                          {[...Array(5)].map((_, i: number) => (
                            <span key={i} className={`text-${i < review.rating ? 'yellow' : 'gray'}-400`}>
                              ★
                            </span>
                          ))}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {review.dateText}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {review.buyer.nickname} from {review.buyer.countryName}
                      </div>
                    </div>
                    <p className="text-sm mb-3">{review.content}</p>
                    {review.images.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {review.images.map((image: ReviewImage, idx: number) => (
                          <div 
                            key={idx} 
                            className="relative w-20 h-20 flex-shrink-0 cursor-pointer"
                            onClick={() => {
                              setSelectedReviewImages(
                                review.images.map(img => ({
                                  url: img.url,
                                  thumbnail: img.thumbnail || img.url
                                }))
                              );
                              setSelectedImageIndex(idx);
                              setLightboxOpen(true);
                            }}
                          >
                            <Image
                              src={image.thumbnail || image.url}
                              alt={`Review image ${idx + 1}`}
                              fill
                              className="object-cover rounded-md hover:opacity-90 transition-opacity"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogContent className="max-w-[90vw] w-full max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>CSV Data Preview</DialogTitle>
              </DialogHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {getCSVData().headers.map((header, i) => (
                        <TableHead key={i}>{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getCSVData().rows.map((row, i) => (
                      <TableRow key={i}>
                        {row.map((cell, j) => (
                          <TableCell key={j}>{cell}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
          </Dialog>

          {/* Reviews Dialog */}
          <Dialog open={showReviewsDialog} onOpenChange={setShowReviewsDialog}>
            <DialogContent className="max-w-[90vw] w-full max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>All Customer Reviews</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                {productData?.reviews?.map((review: Review) => (
                  <div key={review.id} className="border-b pb-6 last:border-0">
                    <div className="flex justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="flex">
                          {[...Array(5)].map((_, i: number) => (
                            <span key={i} className={`text-${i < review.rating ? 'yellow' : 'gray'}-400`}>
                              ★
                            </span>
                          ))}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {review.dateText}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {review.buyer.nickname} from {review.buyer.countryName}
                      </div>
                    </div>
                    <p className="text-sm mb-3">{review.content}</p>
                    {review.images.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {review.images.map((image: ReviewImage, idx: number) => (
                          <div 
                            key={idx} 
                            className="relative w-20 h-20 flex-shrink-0 cursor-pointer"
                            onClick={() => {
                              setSelectedReviewImages(
                                review.images.map(img => ({
                                  url: img.url,
                                  thumbnail: img.thumbnail || img.url
                                }))
                              );
                              setSelectedImageIndex(idx);
                              setLightboxOpen(true);
                            }}
                          >
                            <Image
                              src={image.thumbnail || image.url}
                              alt={`Review image ${idx + 1}`}
                              fill
                              className="object-cover rounded-md hover:opacity-90 transition-opacity"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {review.attributes.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm text-muted-foreground">Purchased Variation:</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {review.attributes.map((attr: ReviewAttribute, idx: number) => (
                            <span key={idx} className="text-xs bg-muted px-2 py-1 rounded">
                              {attr.attrname}: {attr.attrvalue}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <ImageLightbox
            images={selectedReviewImages}
            index={selectedImageIndex}
            open={lightboxOpen}
            onOpenChange={setLightboxOpen}
          />

          <ProductEditDialog
            open={showEditDialog}
            onClose={() => setShowEditDialog(false)}
            onConfirm={handleEditConfirm}
            initialPrice={String(productData?.priceInfos[0]?.price || 0)}
            initialDescription={productData?.description || ''}
          />
        </div>
      )}
    </div>
  );
}