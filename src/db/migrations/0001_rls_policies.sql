-- Row Level Security policies.
--
-- On Supabase, `auth.uid()` is provided natively by the platform (reads the
-- JWT `sub` claim of the currently authenticated request). This app also
-- runs its RLS-equivalent tests against pglite, which has no `auth` schema,
-- so we define a thin `auth.uid()` shim there (see tests/db/pglite.ts) that
-- reads a per-connection Postgres setting (`request.jwt.claim.sub`) instead.
-- The policies below are written purely in terms of `auth.uid()` so the
-- exact same SQL runs unmodified against both Supabase and the pglite test
-- harness — this is the mechanism that lets the tenant-isolation test in
-- tests/integration/tenant-isolation.test.ts exercise the real policy SQL
-- rather than a re-implementation of it.
--
-- Policy shape used throughout: a user may SELECT/INSERT/UPDATE/DELETE a
-- tenant-owned row iff a brand_members row exists for
-- (auth.uid(), row.brand_id). Role-gated write actions (e.g. only
-- owner/admin can invite members) are enforced in the application layer
-- (server actions / route handlers), not in RLS, because that logic needs
-- richer error messages than a blanket policy denial can provide — but RLS
-- is still the last line of defense for READ isolation between brands,
-- which is the property under test.

CREATE OR REPLACE FUNCTION public.is_brand_member(target_brand_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM brand_members
    WHERE brand_members.brand_id = target_brand_id
      AND brand_members.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.brand_role(target_brand_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role::text
  FROM brand_members
  WHERE brand_members.brand_id = target_brand_id
    AND brand_members.user_id = auth.uid()
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- profiles: a user can read/update only their own profile row.
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- ---------------------------------------------------------------------------
-- brands: readable/writable only by members of that brand.
-- ---------------------------------------------------------------------------
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY brands_select_member ON brands
  FOR SELECT USING (public.is_brand_member(id));

CREATE POLICY brands_update_member ON brands
  FOR UPDATE USING (public.is_brand_member(id));

-- Any authenticated user may create a brand (they become its owner via a
-- brand_members row inserted in the same transaction by the application).
CREATE POLICY brands_insert_authenticated ON brands
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY brands_delete_member ON brands
  FOR DELETE USING (public.is_brand_member(id));

-- ---------------------------------------------------------------------------
-- brand_members: a user can see the membership rows for brands they belong
-- to (so they can see their teammates), but not memberships of brands
-- they're not part of.
-- ---------------------------------------------------------------------------
ALTER TABLE brand_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_members_select_member ON brand_members
  FOR SELECT USING (public.is_brand_member(brand_id));

CREATE POLICY brand_members_insert_member ON brand_members
  FOR INSERT WITH CHECK (
    -- allow inserting your own first membership row (brand creation flow)
    user_id = auth.uid() OR public.is_brand_member(brand_id)
  );

CREATE POLICY brand_members_update_member ON brand_members
  FOR UPDATE USING (public.is_brand_member(brand_id));

CREATE POLICY brand_members_delete_member ON brand_members
  FOR DELETE USING (public.is_brand_member(brand_id));

-- ---------------------------------------------------------------------------
-- invites: visible/manageable by members of the brand being invited to.
-- ---------------------------------------------------------------------------
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY invites_all_member ON invites
  FOR ALL USING (public.is_brand_member(brand_id))
  WITH CHECK (public.is_brand_member(brand_id));

-- ---------------------------------------------------------------------------
-- Generic tenant-owned tables: standard "member of brand_id" policy for
-- all CRUD operations. Each of these tables has a brand_id column with a
-- NOT NULL foreign key to brands.id.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  tenant_tables text[] := ARRAY[
    'stores',
    'products',
    'brand_documents',
    'brand_document_chunks',
    'keywords',
    'keyword_scores',
    'keyword_clusters',
    'cluster_keywords',
    'competitors',
    'competitor_pages',
    'gap_reports',
    'content_briefs',
    'content_pipeline_runs',
    'content_pipeline_steps',
    'articles',
    'article_versions',
    'article_claims',
    'images',
    'schema_objects',
    'publications',
    'ai_prompts',
    'ai_visibility_snapshots',
    'recommendations',
    'analytics_events',
    'subscriptions',
    'usage_events',
    'jobs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (public.is_brand_member(brand_id)) WITH CHECK (public.is_brand_member(brand_id))',
      tbl || '_all_member',
      tbl
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- ai_platforms: global reference table, not tenant-owned. Readable by any
-- authenticated user; writable only via migrations/service role (no INSERT/
-- UPDATE/DELETE policy is defined, so those default-deny under RLS for
-- normal authenticated roles).
-- ---------------------------------------------------------------------------
ALTER TABLE ai_platforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_platforms_select_authenticated ON ai_platforms
  FOR SELECT USING (auth.uid() IS NOT NULL);
