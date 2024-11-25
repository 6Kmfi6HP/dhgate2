export interface ReviewImage {
  url: string;
  thumbnail: string;
}

export interface ReviewAttribute {
  attrname: string;
  attrvalue: string;
}

export interface ReviewBuyer {
  nickname: string;
  level: string;
  country: string;
  countryName: string;
}

export interface ReviewAttach {
  videoUrl: string | null;
  imgs: {
    imgUrl: string;
    miniImgUrl: string;
  }[];
}

export interface ReviewData {
  reviewid: number;
  createddate: number;
  createdDateText: string;
  score: number;
  content: string;
  buyerNickname: string;
  buyerlevel: string;
  country: string;
  countryFullname: string;
  reviewAttach: ReviewAttach;
  prodAttrs: ReviewAttribute[];
}

export interface Review {
  id: string;
  date: string | number;
  dateText: string;
  rating: number;
  content: string;
  buyer: ReviewBuyer;
  images: ReviewImage[];
  attributes: ReviewAttribute[];
}

export interface RecommendedProductPrice {
  current: {
    min: string;
    max: string;
  };
  original: {
    min: string;
    max: string;
  };
}

export interface RecommendedProductShipping {
  free: boolean;
  xDayArrive: number;
}

export interface RecommendedProductSeller {
  name: string;
  id: string;
}

export interface RecommendedProduct {
  title: string;
  itemCode: string;
  url: string;
  image: string;
  price: RecommendedProductPrice;
  minOrder: string;
  rating: string;
  orders: string;
  shipping: RecommendedProductShipping;
  seller: RecommendedProductSeller;
}

export interface ProductEditData {
  regular_price: string;
  categories: Array<{
    id: number;
    name: string;
  }>;
  tags: Array<{
    id?: number;
    name: string;
  }>;
  description?: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
} 