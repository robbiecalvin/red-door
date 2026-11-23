# Bulk adult video catalog

Stage the thumbnail export into a new private directory. The input ZIP must contain `video_links_with_thumbnails.csv` with the category, video_url, destination_url, and thumbnail_url columns.

```sh
python3 scripts/stage-adult-catalog.py /path/to/video_links_with_thumbnails.csv.zip /path/to/private-catalog
```

Use the staged directory as `ADULT_CATALOG_DIR` for both the web build and the web API runtime. Keep it outside the public document root. The build publishes category names and page counts. The API serves individual batches of up to 20 entries after the existing member and age checks.

Publish the site build and API against the same catalog snapshot. The default build still works without a staged catalog. Category URLs have page-specific canonicals and noindex while their public copy consists of category and pagination information. Profile favorites still use the curated directory.
