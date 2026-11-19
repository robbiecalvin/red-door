export type Article = {
  slug: string;
  title: string;
  synopsis: string;
  body: string;
  byline: string;
  status: "draft" | "pending" | "published" | "rejected";
  publishedAtMs?: number;
};
