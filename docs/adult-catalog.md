# Bulk adult video catalog

Stage the thumbnail export into a new private directory. The input ZIP must contain `video_links_with_thumbnails.csv` with the category, video_url, destination_url, and thumbnail_url columns.

```sh
python3 scripts/stage-adult-catalog.py /path/to/video_links_with_thumbnails.csv.zip /path/to/private-catalog
```

For local validation, use the staged directory as `ADULT_CATALOG_DIR` for both the web build and API. Production uses the checked-in category manifest for the public build and the existing PostgreSQL database for private data. Keep it outside the public document root. The build publishes category names and page counts. The API serves individual batches of up to 20 entries after the existing member and age checks.

Publish the site build and API against the same catalog snapshot. For a controlled import, configure a temporary SHA-256 hash of a high-entropy key as `ADULT_CATALOG_IMPORT_SHA256`. POST batches of up to 100 page records to `/internal/adult-catalog/import` with the corresponding `x-catalog-import-key` header. Each page record has a category slug, page number, and videos. Disable the import route immediately after verification by clearing the hash and redeploying. The sitemap lists each generated catalog page at its page-specific canonical URL. Public pages show category and pagination information. Members can save up to three profile favorites from the curated directory or bulk catalog.
