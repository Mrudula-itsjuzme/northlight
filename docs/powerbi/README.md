# Northlight Operations Dashboard (Power BI starter)

This is a **draft report design**, not a deployed Microsoft Power BI report.
It uses Northlight's real application table fields, exported through the new
tenant-authorized CSV endpoint. Work with one brand at a time.

## Get the data

After the integration branch has passed CI and been deployed to a staging
environment, sign in to Northlight as a brand member and obtain the brand UUID.
From your authenticated browser session, download:

- `/api/integrations/power-bi/export?brandId=YOUR_BRAND_UUID&kind=pipeline`
  and save as `northlight-pipeline.csv`.
- `/api/integrations/power-bi/export?brandId=YOUR_BRAND_UUID&kind=articles`
  and save as `northlight-articles.csv`.

Both downloads are subject to brand membership checks, return only the most
recent 5,000 rows per table, and do **not** support scheduled refresh. Treat
the CSV files as confidential tenant data.

## Load into Power BI Desktop

1. Home -> Get data -> Text/CSV -> import each file.
2. Rename the resulting queries exactly to `PipelineRuns` and `Articles`.
3. In Transform Data, set:
   - PipelineRuns[run_id], [brief_id], [status], [current_stage], [data_origin] = Text
   - PipelineRuns[cost_cents], [total_tokens] = Whole number
   - PipelineRuns[created_at] = Date/Time/Timezone (or convert consistently to UTC)
   - Articles[article_id], [title], [status], [data_origin] = Text
   - Articles[seo_score], [ai_readiness_score] = Decimal number
   - Articles[published_at], [created_at] = Date/Time/Timezone
4. The two exports have no shared article-to-run join key. **Do not create
   a many-to-many relationship** between these tables. They are independent
   facts, and measures should be scoped to their own table.
5. Open Model view -> create each measure from `Northlight_Measures.dax`.
   These formulas are intended to be copied as separate measures, not run as
   a single DAX script.

## Recommended report pages

### Page 1: Operations overview
- Cards: Pipeline Runs, Completed Runs, Completion Rate, Total Cost (USD),
  Articles, Published Articles
- Stacked bar: PipelineRuns[status] by Pipeline Runs
- Line chart: PipelineRuns[created_at] (day) by Pipeline Runs
- Slicers: PipelineRuns[status], PipelineRuns[data_origin]

### Page 2: Content quality
- Cards: Average SEO Score, Average AI Readiness Score, Review Backlog
- Bar: Articles[status] by Articles
- Table: Articles[title], [status], [seo_score], [ai_readiness_score],
  [published_at]
- Slicers: Articles[status], Articles[data_origin]

### Page 3: Efficiency
- Cards: Average Cost Per Completed Run (USD), Tokens Used,
  Failed Runs
- Bar: PipelineRuns[current_stage] by Pipeline Runs
- Line: PipelineRuns[created_at] (day) by Total Cost (USD)

## Accuracy and security notes

- `data_origin=demo` means simulated/seed data, not customer activity.
- Cost is recorded in cents. Do not call it actual vendor billing unless
  the Northlight cost-tracking implementation has been audited.
- A completed pipeline run means the content pipeline succeeded; it does
  **not** mean an article was approved or published.
- Review backlog is Articles with status `review`, *not* the number of
  unresolved claim rows.
- The exports are capped at 5,000 recent rows; KPIs from truncated exports
  do **not** represent full historical lifetime counts.
- This report's exported CSVs do not enforce live row-level security in Power
  BI. Restrict report/workspace access and do not aggregate multiple brand
  exports without implementing a separate tested tenant-scoped security model.
- Neither Power Apps nor Power Automate has to be enabled to open this report.

## Next step

Save the resulting report as `Northlight-Operations.pbip` in Power BI
Desktop (File -> Save As -> Power BI Project) after validating the numbers
against Northlight's own application. Keep the PBIP under version control
only if it contains no sensitive embedded data or credentials.
