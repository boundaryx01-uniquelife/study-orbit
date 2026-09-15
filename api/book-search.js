function cleanTitle(title) {
  return String(title || "").replace(/<[^>]*>/g, "").trim();
}

function guessSubject(query) {
  if (query.includes("수학")) return "수학";
  if (query.includes("과학") || query.includes("물리") || query.includes("화학") || query.includes("생명") || query.includes("지구")) return "과학";
  if (query.includes("영어")) return "영어";
  if (query.includes("국어")) return "국어";
  if (query.includes("사회")) return "사회";
  return "기타";
}

export default async function handler(req, res) {
  const key = process.env.KAKAO_REST_API_KEY;

  if (!key) {
    res.status(500).json({ error: "KAKAO_REST_API_KEY_MISSING" });
    return;
  }

  const rawQuery = String(req.query.q || "").trim();
  if (!rawQuery) {
    res.status(400).json({ error: "QUERY_REQUIRED" });
    return;
  }

  const apiUrl = new URL("https://dapi.kakao.com/v3/search/book");
  apiUrl.searchParams.set("query", rawQuery);
  apiUrl.searchParams.set("target", "title");
  apiUrl.searchParams.set("sort", "accuracy");
  apiUrl.searchParams.set("page", "1");
  apiUrl.searchParams.set("size", "10");

  const response = await fetch(apiUrl, {
    headers: { Authorization: `KakaoAK ${key}` }
  });

  if (!response.ok) {
    const detail = await response.text();
    res.status(response.status).json({
      error: "KAKAO_BOOK_API_ERROR",
      status: response.status,
      detail: detail.slice(0, 500)
    });
    return;
  }

  const data = await response.json();
  const items = (data.documents || []).map((book) => ({
    title: cleanTitle(book.title),
    authors: book.authors || [],
    publisher: book.publisher || "",
    isbn: book.isbn || "",
    thumbnail: book.thumbnail || "",
    cover: book.thumbnail || "",
    url: book.url || "",
    datetime: book.datetime || "",
    price: book.price || 0,
    salePrice: book.sale_price || 0,
    status: book.status || "",
    subject: guessSubject(`${book.title} ${rawQuery}`),
    source: "Kakao Book Search"
  }));

  res.status(200).json({
    query: rawQuery,
    totalCount: data.meta?.total_count || 0,
    items
  });
}
