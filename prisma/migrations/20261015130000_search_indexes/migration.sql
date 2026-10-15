-- Search: trigram (typo tolerance + autocomplete) and full-text indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX IF NOT EXISTS "Product_searchText_trgm_idx"
  ON "Product" USING GIN ("searchText" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Product_searchText_fts_idx"
  ON "Product" USING GIN (to_tsvector('simple', "searchText"));

CREATE INDEX IF NOT EXISTS "SearchQuery_query_trgm_idx"
  ON "SearchQuery" USING GIN ("query" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Message_text_fts_idx"
  ON "Message" USING GIN (to_tsvector('simple', coalesce("text", '')));
