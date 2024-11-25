import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ProductEditData, Category } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { HtmlEditor } from './html-editor';

interface ProductEditDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: ProductEditData) => void;
  initialPrice: string;
  initialDescription: string;
}

// Add type for select option
type SelectOption = {
  value: string;
  label: string;
};

function buildCategoryTree(categories: Category[]) {
  // First sort categories so parents come before children
  return categories.sort((a, b) => {
    // Root categories first
    if (a.parent === 0 && b.parent !== 0) return -1;
    if (a.parent !== 0 && b.parent === 0) return 1;
    
    // Group categories with same parent together
    if (a.parent === b.parent) {
      return a.name.localeCompare(b.name);
    }
    
    // Sort by parent ID
    return a.parent - b.parent;
  });
}

export function ProductEditDialog({ open, onClose, onConfirm, initialPrice, initialDescription }: ProductEditDialogProps) {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editData, setEditData] = useState<ProductEditData>({
    regular_price: initialPrice,
    categories: [],
    tags: [],
    description: initialDescription || ''
  });
  const [newTag, setNewTag] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // 获取分类列表
  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await fetch('/api/woocommerce/categories');
        const data = await response.json();
        setCategories(data);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      }
    }

    if (open) {
      fetchCategories();
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(editData);
  };

  const handleAddTag = () => {
    if (newTag && !editData.tags.some(tag => tag.name === newTag)) {
      setEditData(prev => ({
        ...prev,
        tags: [...prev.tags, { name: newTag }]
      }));
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagName: string) => {
    setEditData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag.name !== tagName)
    }));
  };

  // Format category name with proper indentation
  const formatCategoryName = (category: Category, categories: Category[]) => {
    if (category.parent === 0) {
      return category.name;
    }
    
    // Find parent category
    const parent = categories.find(cat => cat.id === category.parent);
    if (!parent) return category.name;

    return `${parent.name} > ${category.name}`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] w-full sm:max-w-[500px] md:max-w-[600px] lg:max-w-[1200px] flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle>编辑产品信息</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4">
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="price">价格</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={editData.regular_price}
                  onChange={(e) => setEditData(prev => ({
                    ...prev,
                    regular_price: e.target.value
                  }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>分类</Label>
                <Select
                  value={selectedCategory}
                  onValueChange={(value: string) => {
                    const category = categories.find(cat => cat.id.toString() === value);
                    if (category) {
                      setEditData(prev => ({
                        ...prev,
                        categories: [{ id: category.id, name: category.name }]
                      }));
                      setSelectedCategory(value);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {buildCategoryTree(categories).map(cat => (
                      <SelectItem 
                        key={cat.id} 
                        value={cat.id.toString()}
                        className="whitespace-normal break-words"
                      >
                        {formatCategoryName(cat, categories)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>标签</Label>
                <div className="flex gap-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="输入标签名称"
                  />
                  <Button type="button" onClick={handleAddTag}>添加</Button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {editData.tags.map(tag => (
                    <div
                      key={tag.name}
                      className="bg-gray-100 px-2 py-1 rounded-md flex items-center gap-1.5 text-sm"
                    >
                      {tag.name}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag.name)}
                        className="text-red-500 hover:text-red-700"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <div className="min-h-[250px]">
                  <HtmlEditor
                    value={editData.description || ''}
                    onChange={(value) => setEditData(prev => ({
                      ...prev,
                      description: value
                    }))}
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        <DialogFooter className="px-4 py-2 border-t">
          <Button type="submit" disabled={loading} onClick={handleSubmit}>
            {loading && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 