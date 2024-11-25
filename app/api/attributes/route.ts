import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { Review, ReviewData } from "@/lib/types";
import htmlclean from "htmlclean";

export const runtime = "edge";

interface AttributeValue {
  attrValName: string;
  picUrl?: string;
}

interface Attribute {
  attrName: string;
  itemAttrvalList: AttributeValue[];
}

const CACHE_DURATION = 36000; // 10 hours in seconds
const cache = new Map<string, { data: any; timestamp: number }>();

let cachedCookie: string | null = null;
function generateCookie(): string {
  if (cachedCookie) return cachedCookie;

  const phpsessid =
    Math.random().toString(36).slice(2, 15) +
    Math.random().toString(36).slice(2, 15);

  cachedCookie = [
    `PHPSESSID=${phpsessid}`,
    "DHaccept=webp",
    "ref_df=direct",
    "language=en",
    "intl_currency=USD",
    "__dh_gdpr__=1",
    "b_u_cc=ucc=US",
    "suship=US",
    "b2b_ship_country=US",
    "b2b_ip_country=US",
  ].join("; ");

  return cachedCookie;
}

export const fetchCache = "force-cache";
export const revalidate = 3600; // 1 hour

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "URL parameter is required" },
      { status: 400 }
    );
  }

  const cachedData = cache.get(url);
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION * 1000) {
    return NextResponse.json(cachedData.data);
  }

  // Define headers once to reuse
  const headers = {
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "sec-ch-ua":
      '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    cookie: generateCookie(),
    Referer: "https://www.dhgate.com",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000); // 25 second timeout

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      // throw new Error("Failed to fetch product page" + response.statusText);
      return NextResponse.json(
        {
          error:
            "stage 1: Failed to fetch product page: " + response.statusText,
          status: response.status,
          html: await response.text(),
        },
        { status: response.status }
      );
    }

    const html = (await response.text()).replace(/\\"/g, '"');
    const $ = cheerio.load(html);

    // Extract quantities and prices
    const priceMap = new Map<number, number>();
    const priceData = html.match(
      /"endQty":(\d+)[^}]*?(?:"promDiscountPrice"|"originalPrice"):(\d+(?:\.\d+)?)/g
    );

    if (priceData) {
      priceData.forEach((match) => {
        const qty = parseInt(match.match(/"endQty":(\d+)/)?.[1] || "0", 10);
        const price = parseFloat(
          match.match(
            /(?:"promDiscountPrice"|"originalPrice"):(\d+(?:\.\d+)?)/
          )?.[1] || "0"
        );
        if (qty && price) {
          priceMap.set(qty, price);
        }
      });
    }

    // Convert Map to array and sort by quantity
    const priceInfos = Array.from(priceMap)
      .map(([quantity, price]) => ({
        quantity,
        price,
      }))
      .sort((a, b) => a.quantity - b.quantity)
      .map((info, index, array) => {
        // For the first price tier, start from 1
        if (index === 0) {
          return {
            price: info.price,
            minQuantity: 1,
          };
        }
        // For subsequent tiers, use the previous tier's quantity + 1
        return {
          price: info.price,
          minQuantity: array[index - 1].quantity + 1,
        };
      });

    // Extract images using CSS selector
    const images = Array.from(
      new Set(
        $('[class^="masterMap_smallMapList"] li span img')
          .map((_, img) =>
            $(img)
              .attr("src")
              ?.replace(/(?:200x200|100x100)/i, "0x0")
          )
          .get()
          .filter(Boolean)
      )
    );

    // 修改标题获取方式
    const title = $('[class^="productInfo_productInfo"] h1')
      .first()
      .text()
      .trim();

    const pattern = /"itemAttrList":\[(.*?)\](?=,"firstItemAttrList")/g;
    const match = html.match(pattern);

    let processedAttributes = {};
    if (match) {
      const attributes = JSON.parse(
        match[0].replace('"itemAttrList":', "").replace(/\\/g, "")
      );

      processedAttributes = attributes.reduce((acc: any, attr: Attribute) => {
        if (attr.attrName !== "Shipping from") {
          acc[attr.attrName] = attr.itemAttrvalList.map(
            ({ attrValName, picUrl }) => ({
              value: attrValName,
              image_url: picUrl?.replace("200x200", "0x0") || "",
            })
          );
        }
        return acc;
      }, {});
    }

    // Extract and clean product description
    let description = $('[class^="prodDesc_decHtml"]')
      .children()
      .map((_, element) => {
        const $elem = $(element);

        // Remove unwanted elements and attributes in one pass
        $elem.find("style, script, link").remove();

        // Simplified attribute removal
        $elem.find("*").each((_, el) => {
          const $el = $(el);
          if ($el.is("img")) {
            $el.attr(
              "src",
              $el.attr("src")?.replace(/(?:200x200|100x100)/i, "0x0") || ""
            );
            $el.removeAttr("class style width height loading");
          } else if ($el.is("a")) {
            $el.is('[href*="dhgate.com"]')
              ? $el.replaceWith($el.contents())
              : $el.removeAttr("class style");
          } else {
            $el.removeAttr("class style");
          }
        });

        return $elem.html();
      })
      .get()
      .filter(Boolean)
      .join("");

    // Simple regex cleanup instead of multiple passes
    // description = description
    //   .replace(/<(div|td)/g, '<p')
    //   .replace(/<\/(div|td)/g, '</p')
    //   .replace(/<p>\s*<\/p>/g, '')
    //   .replace(/https?:\/\/[^"'\s>]*?dhgate\.com[^"'\s>]*/g, '');

    // Perform replacements in a single pass with a combined regex
    description = description.replace(
      /(<div|<td |<\/td |<\/div>|<p>\s*<\/p>|https?:\/\/([\w\-]+\.)*dhgate\.com\S*?\.html|<a[^>]*>(.*?)<\/a>|\s+(width|height|style)="[^"]*"|\s+(width|height)=\d+|<table[^>]*>|<\/table>)/g,
      (match, p1) => {
        if (match.startsWith("<div")) return "<p";
        if (match.startsWith("<td ")) return "<p ";
        if (match.startsWith("</td")) return "</p>";
        if (match === "</div>") return "</p>";
        if (match.match(/<p>\s*<\/p>/)) return "";
        if (match.match(/https?:\/\/([\w\-]+\.)*dhgate\.com/)) return "";
        if (match.match(/<a[^>]*>(.*?)<\/a>/)) return p1;
        if (match.match(/<table[^>]*>/)) return "<p>";
        if (match === "</table>") return "</p>";
        return "";
      }
    );

    // Apply htmlclean to further minify the HTML
    description = htmlclean(description, {
      protect: /<img[^>]*>/g, // Protect image tags
      // unprotect: /<a[^>]*>/g, // Protect a tags
    });

    // Extract specifications
    const specifications: Record<string, string> = {};
    $('[class^="prodSpecifications_showUl"]')
      .find("li")
      .each((_, element) => {
        const $elem = $(element);
        const label = $elem.find("span").text().replace(":", "").trim();
        const value = $elem
          .find('[class^="prodSpecifications_deswrap"]')
          .text()
          .trim();

        if (label && value) {
          specifications[label] = value;
        }
      });

    // Extract sold count
    const soldCount =
      $('[class^="productSellerMsg_sold"]')
        .text()
        .trim()
        .replace(/\s+/g, " ") // Replace multiple spaces with single space
        .match(/(\d+)\s*sold/i)?.[1] || "0"; // Extract number before "sold"

    // Extract item code from URL
    const itemCode = url.match(/\/(\d+)\.html/)?.[1];

    // Fetch reviews if item code is found
    let reviews: Review[] = [];
    if (itemCode) {
      // 随机生成一个1-100的数字作为pageSize
      const pageSize = Math.floor(Math.random() * 100) + 10;
      const reviewUrl = `https://www.dhgate.com/reviewbuyer/reviewOfProd/pageReviewOfProd?itemCode=${itemCode}&language=en&client=pc&dispCurrency=USD&sortType=1&pageNum=1&pageSize=${pageSize}&url_r=${encodeURIComponent(
        url
      )}`;
      const reviewResponse = await fetch(reviewUrl, {
        headers: {
          ...headers,
          accept: "application/json",
          "content-type": "application/json",
        },
      });

      if (reviewResponse.ok) {
        const reviewData = await reviewResponse.json();
        // 检查 reviewData 和 reviewData.data 是否存在
        if (reviewData?.data?.data) {
          reviews = reviewData.data.data.map((review: ReviewData) => ({
            id: review.reviewid.toString(),
            date: review.createddate,
            dateText: review.createdDateText,
            rating: review.score,
            content: review.content,
            buyer: {
              nickname: review.buyerNickname,
              level: review.buyerlevel,
              country: review.country,
              countryName: review.countryFullname,
            },
            images:
              review.reviewAttach?.imgs?.map(
                (img: { imgUrl: string; miniImgUrl: string }) => ({
                  url: img.imgUrl.replace(/200x200/, "0x0"),
                  thumbnail: img.miniImgUrl || img.imgUrl,
                })
              ) || [],
            attributes: review.prodAttrs || [],
          }));
        }
        // 如果没有评论数据，reviews 将保持为空数组
      } else {
        return NextResponse.json(
          {
            error: "stage 2: No reviews found",
            status: reviewResponse.status,
            html: await reviewResponse.text(),
          },
          { status: reviewResponse.status }
        );
      }
    }

    // Fetch recommended products
    if (itemCode) {
      const recomUrl = `https://www.dhgate.com/prod/ajax/recom.do?client=pc&language=en&dispCurrency=USD&itemCode=${itemCode}&pos=yml&pageNum=1&pageSize=10&publicLanguage=en&isBot=false&url_f=&url_r=${encodeURIComponent(
        url
      )}`;

      const recomResponse = await fetch(recomUrl, {
        headers: {
          ...headers,
          accept: "application/json",
          "content-type": "application/json",
        },
      });

      if (recomResponse.ok) {
        const recomData = await recomResponse.json();
        if (recomData?.data) {
          const recommendations = recomData.data.map((item: any) => ({
            title: item.title,
            itemCode: item.itemCode,
            // 将 url 中的 # 后面的内容去掉
            url: item.url.split("#")[0],
            image: item.img?.replace(/260x260/, "0x0"),
            // 将 price 中的 US 去掉
            price: {
              current: {
                min: item.lowPrice.replace("US", ""),
                max: item.highPrice.replace("US", ""),
              },
              original: {
                min: item.lowOrgPrice.replace("US", ""),
                max: item.highOrgPrice.replace("US", ""),
              },
            },
            order: item.productOrders || 0,
            minOrder: item.minOrder,
            rating: item.stars || 0,
            orders: item.order || 0,
            shipping: {
              free: item.freeshipping === "1",
              xDayArrive: item.xDayArrive,
            },
            seller: {
              name: item.sellername,
              id: item.supplierId,
            },
          }));

          return NextResponse.json(
            {
              title,
              images,
              description,
              priceInfos,
              soldCount: parseInt(soldCount, 10),
              attributes: processedAttributes,
              specifications,
              reviews,
              recommendations,
            },
            {
              headers: {
                "Cache-Control": "public, max-age=3600, s-maxage=3600",
                "CDN-Cache-Control": "public, max-age=3600",
              },
            }
          );
        }
      } else {
        return NextResponse.json(
          {
            error: "stage 3: No recommendations found",
            status: recomResponse.status,
            html: await recomResponse.text(),
          },
          { status: recomResponse.status }
        );
      }
    }

    return NextResponse.json(
      {
        title,
        images,
        description,
        priceInfos,
        soldCount: parseInt(soldCount, 10),
        attributes: processedAttributes,
        specifications,
        reviews,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
          "CDN-Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching attributes:", error);
    return NextResponse.json(
      { error: "Failed to fetch product attributes: " + error },
      { status: 500 }
    );
  }
}
