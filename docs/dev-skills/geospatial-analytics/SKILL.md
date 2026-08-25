---
name: geospatial-analytics
description: "Use when implementing PostGIS spatial queries, building interactive maps with Mapbox/Leaflet/deck.gl, processing GeoJSON/vector tiles, or rendering geospatial heatmaps. Invoke for spatial indexing (GiST), ST_* functions, coordinate system handling, and map visualization layers. Trigger terms: PostGIS, Mapbox, Leaflet, deck.gl, GeoJSON, heatmap, spatial query, GiST index, coordinate system, map tiles, vector tiles, geospatial, ST_Within, ST_DWithin, ST_Contains, map rendering."
license: MIT
metadata:
  author: DevAtlas
  version: "1.0.0"
  domain: geospatial
  triggers: PostGIS, Mapbox, Leaflet, deck.gl, GeoJSON, heatmap, spatial query, GiST, coordinate system, map tiles, vector tiles, geospatial, ST_Within, ST_DWithin, ST_Contains, map rendering
  roles: specialist
  scope: implementation
  output-format: code
  related-skills:
    - postgres-pro
    - nextjs-developer
    - fastapi-expert
---

# Geospatial Analytics

Senior geospatial engineer specializing in PostGIS, interactive map visualization, and spatial data pipelines for developer ecosystem intelligence platforms.

## When to Use This Skill

- Implementing PostGIS spatial queries and indexes for regional developer activity
- Building interactive maps with Mapbox GL JS, Leaflet, or deck.gl
- Processing GeoJSON and vector tile data pipelines
- Rendering geospatial heatmaps from GitHub activity data
- Handling coordinate reference systems (CRS) and projections
- Optimizing spatial query performance with GiST indexes

## Core Competencies

### PostGIS & Spatial Database

**Spatial Indexing:**
```sql
-- GiST index for point data (developer locations)
CREATE INDEX idx_repos_geom ON repositories USING GIST (geom);
CREATE INDEX idx_events_geom ON github_events USING GIST (location_geom);

-- Partial index for active repositories
CREATE INDEX idx_repos_active ON repositories USING GIST (geom)
  WHERE last_activity_at > NOW() - INTERVAL '90 days';
```

**Essential ST_* Functions for DevAtlas:**
```sql
-- Find repositories within a bounding box
SELECT * FROM repositories
WHERE geom && ST_MakeEnvelope(-180, -90, 180, 90, 4326);

-- Find repositories within N km of a point
SELECT * FROM repositories
WHERE ST_DWithin(
  geom,
  ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography,
  N * 1000  -- meters
);

-- Cluster repositories by region
SELECT
  ST_ClusterKMeans(geom, 10) OVER() AS cluster_id,
  COUNT(*) as repo_count,
  AVG(ST_X(geom)) as center_lon,
  AVG(ST_Y(geom)) as center_lat
FROM repositories
GROUP BY cluster_id;

-- Calculate regional technology density
SELECT
  region,
  language,
  COUNT(*) as repo_count,
  ST_Centroid(ST_Collect(geom)) as region_center
FROM repositories
JOIN regions ON ST_Within(repositories.geom, regions.geom)
GROUP BY region, language;
```

**Coordinate Reference Systems:**
- Always store in WGS84 (EPSG:4326) for web maps
- Use geography type for distance calculations (meters)
- Use geometry type for planar operations (faster)
- Transform projections when needed: `ST_Transform(geom, 3857)` for Web Mercator

### Map Visualization

**Mapbox GL JS Integration:**
```typescript
// Heatmap layer for developer activity
map.addLayer({
  id: 'developer-heatmap',
  type: 'heatmap',
  source: 'repositories',
  paint: {
    'heatmap-weight': [
      'interpolate', ['linear'], ['get', 'activity_score'],
      0, 0,
      100, 1
    ],
    'heatmap-intensity': [
      'interpolate', ['linear'], ['zoom'],
      0, 1,
      9, 3
    ],
    'heatmap-color': [
      'interpolate', ['linear'], ['heatmap-density'],
      0, 'rgba(0,0,255,0)',
      0.2, 'rgb(0,0,255)',
      0.4, 'rgb(0,255,255)',
      0.6, 'rgb(0,255,0)',
      0.8, 'rgb(255,255,0)',
      1, 'rgb(255,0,0)'
    ],
    'heatmap-radius': [
      'interpolate', ['linear'], ['zoom'],
      0, 2,
      9, 20
    ]
  }
});
```

**deck.gl Integration (React):**
```typescript
import { HeatmapLayer } from '@deck.gl/aggregation-layers';

const heatmapLayer = new HeatmapLayer({
  id: 'github-activity-heatmap',
  data: repositories,
  getPosition: d => [d.longitude, d.latitude],
  getWeight: d => d.activity_score,
  radiusPixels: 30,
  intensity: 1,
  threshold: 0.05
});
```

**Leaflet Integration:**
```typescript
import L from 'leaflet';
import 'leaflet.heat';

const heatmapLayer = L.heatLayer(
  repositories.map(r => [r.latitude, r.longitude, r.activity_score]),
  {
    radius: 25,
    blur: 15,
    maxZoom: 17,
    gradient: {
      0.0: 'blue',
      0.5: 'lime',
      1.0: 'red'
    }
  }
).addTo(map);
```

### GeoJSON & Vector Tiles

**GeoJSON Processing:**
```python
import geopandas as gpd
from shapely.geometry import Point

# Load GitHub event data with coordinates
df = pd.read_csv('github_events.csv')
gdf = gpd.GeoDataFrame(
  df,
  geometry=gpd.points_from_xy(df.longitude, df.latitude),
  crs='EPSG:4326'
)

# Save as GeoJSON for frontend
gdf.to_file('repositories.geojson', driver='GeoJSON')

# Generate vector tiles (MBTiles)
import tilestrata
# Or use tippecanoe: https://github.com/mapbox/tippecanoe
```

**Vector Tile Generation:**
```bash
# Convert GeoJSON to vector tiles with tippecanoe
tippecanoe \
  --output=repositories.mbtiles \
  --layer=repositories \
  --maximum-zoom=14 \
  --minimum-zoom=2 \
  --drop-densest-as-needed \
  repositories.geojson
```

### Spatial Data Pipeline Patterns

**Ingestion Pipeline:**
```python
import asyncpg
import geopandas as gdf

async def ingest_repository_location(pool, repo_data):
    """Ingest repository with spatial data."""
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO repositories (id, name, geom, language, stars)
            VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6)
            ON CONFLICT (id) DO UPDATE
            SET geom = EXCLUDED.geom,
                stars = EXCLUDED.stars,
                updated_at = NOW()
        """,
            repo_data['id'],
            repo_data['name'],
            repo_data['longitude'],
            repo_data['latitude'],
            repo_data['language'],
            repo_data['stars']
        )
```

**Batch Spatial Query:**
```python
async def get_regional_activity(pool, bbox, zoom_level):
    """Get aggregated repository activity for a map viewport."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                ST_SnapToGrid(geom, $1) as grid_cell,
                language,
                COUNT(*) as count,
                AVG(stars) as avg_stars
            FROM repositories
            WHERE geom && ST_MakeEnvelope($2, $3, $4, $5, 4326)
            GROUP BY grid_cell, language
        """,
            calculate_grid_size(zoom_level),
            bbox['west'], bbox['south'], bbox['east'], bbox['north']
        )
        return rows
```

## Integration with DevAtlas Stack

- **postgres-pro**: Use for PostGIS extension management, spatial index tuning, and query optimization
- **fastapi-expert**: Build async endpoints that serve GeoJSON and spatial aggregations
- **nextjs-developer**: Implement map components with Mapbox GL JS or deck.gl
- **github-data-pipeline**: Ingest GitHub event data with geocoded locations

## Best Practices

1. **Always use geography type for distance calculations** — avoids projection distortion
2. **Index all spatial columns with GiST** — mandatory for performance at scale
3. **Use ST_SnapToGrid for heatmap aggregation** — reduces point count for rendering
4. **Cache spatial aggregations by zoom level** — pre-compute for common map views
5. **Validate coordinates before insertion** — reject null/invalid geometries
6. **Use Web Mercator (EPSG:3857) for tile rendering** — standard for web maps
7. **Batch GeoJSON exports** — avoid loading millions of points into browser memory

## Common Patterns

**Regional Technology Heatmap:**
```sql
-- Aggregate repositories by language and region
SELECT
  language,
  ST_ClusterKMeans(geom, 50) as cluster_id,
  COUNT(*) as repo_count,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY stars) as median_stars
FROM repositories
WHERE language IS NOT NULL
GROUP BY language, cluster_id;
```

**Time-series Spatial Analysis:**
```sql
-- Track technology adoption by region over time
SELECT
  DATE_TRUNC('month', created_at) as month,
  language,
  region_name,
  COUNT(*) as new_repos,
  ST_Centroid(ST_Collect(geom)) as region_center
FROM repositories
JOIN regions ON ST_Within(repositories.geom, regions.geom)
WHERE created_at > NOW() - INTERVAL '2 years'
GROUP BY month, language, region_name;
```
