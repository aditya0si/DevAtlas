"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { api } from "@/lib/api";
import { useRealtimeRepos } from "@/lib/useRealtimeRepos";
import {
  getDomainColor,
  getFeatureCategory,
  getFeatureDomain,
} from "@/lib/domain";

type GeoJSONFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: string;
    name: string;
    full_name?: string;
    language: string | null;
    stars?: number;
    activity_score?: number;
    /**
     * Provenance of the marker weight. `github_events` = measured pushes,
     * `stars_estimate` = derived from star counts. Optional: older documents
     * (and the hook) may not publish it yet, so it is read defensively.
     */
    activity_source?: string | null;
    push_count_30d?: number | null;
    classification: Record<string, any> | null;
    domain?: string | null;
    description?: string | null;
  };
};

/** Where the per-repository metric shown on the map actually comes from. */
type ActivitySource = "github_events" | "stars_estimate";

function resolveActivitySource(properties: GeoJSONFeature["properties"]): ActivitySource {
  // An explicit provenance field wins when present.
  if (properties.activity_source === "github_events") return "github_events";
  if (properties.activity_source === "stars_estimate") return "stars_estimate";
  // Otherwise, a published push count means the number is measured activity.
  if (typeof properties.push_count_30d === "number" && Number.isFinite(properties.push_count_30d)) {
    return "github_events";
  }
  // Nothing published: the weight is the stars-derived estimate. Never claim
  // it is measured activity.
  return "stars_estimate";
}

function activityMetricLabel(source: ActivitySource): string {
  return source === "github_events" ? "pushes / 30d" : "stars estimate";
}

function formatCount(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US")
    : "—";
}

export interface StoryStep {
  center: [number, number];
  zoom: number;
  title: string;
  pitch?: number;
  bearing?: number;
}

export interface DeveloperMapRef {
  flyTo: (center: [number, number], zoom: number, pitch?: number, bearing?: number) => void;
  resetView: () => void;
  playStory: (steps: StoryStep[], onStep: (title: string) => void) => void;
  pauseStory: () => void;
  resumeStory: () => void;
  skipStory: () => void;
  stopStory: () => void;
}

interface DeveloperMapProps {
  activeFilter?: string;
  year?: number;
  onMapLoad?: () => void;
  onReady?: (actions: DeveloperMapRef) => void;
  onRepositoryClick?: (repoId: string) => void;
}

const DeveloperMap = ({
  activeFilter = "All Projects",
  year,
  onMapLoad,
  onReady,
  onRepositoryClick,
}: DeveloperMapProps) => {
  // Real-time subscription to Firestore. As Cloud Functions sync GitHub repos
  // every 5 min, onSnapshot pushes updates to the map instantly — no refetch.
  const { features: liveFeatures, loading, error } = useRealtimeRepos({
    domain: activeFilter,
    limitCount: 5000,
  });
  const features = liveFeatures as unknown as GeoJSONFeature[];

  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [mapInitError, setMapInitError] = useState<string | null>(null);
  const [sourceUnresponsive, setSourceUnresponsive] = useState(false);
  const [hovered, setHovered] = useState<{
    x: number;
    y: number;
    properties: GeoJSONFeature["properties"];
  } | null>(null);

  // Latest onMapLoad callback, so the init effect can report "the shell is up"
  // even when the WebGL map itself cannot start — without re-creating the map
  // on every parent render (the callback identity changes each render).
  const onMapLoadRef = useRef(onMapLoad);
  useEffect(() => {
    onMapLoadRef.current = onMapLoad;
  }, [onMapLoad]);

  // Story Mode playback state, kept in a ref so the imperative controls
  // (pause/resume/skip/stop) can mutate it without triggering re-renders.
  const storyState = useRef({
    running: false,
    paused: false,
    cancelled: false,
    skip: false,
    steps: [] as StoryStep[],
    index: 0,
    onStep: null as ((title: string) => void) | null,
    resumeResolve: null as (() => void) | null,
  });

  // Wait for the per-step dwell time, honouring pause/resume/skip/cancel.
  const waitForStep = async (state: typeof storyState.current) => {
    const dwellMs = 8000;
    const tickMs = 100;
    let elapsed = 0;
    while (elapsed < dwellMs) {
      if (state.cancelled) return;
      if (state.skip) {
        state.skip = false;
        return;
      }
      if (state.paused) {
        await new Promise<void>((resolve) => {
          state.resumeResolve = resolve;
        });
        state.resumeResolve = null;
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, tickMs));
      elapsed += tickMs;
    }
  };

  useEffect(() => {
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: "devatlas-map",
        style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        center: [0, 0], // Start from space (0,0)
        zoom: 0,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
      });
    } catch (initError) {
      // No WebGL / renderer: keep the map shell mounted and say what happened
      // instead of letting the error take the whole page down.
      setMapInitError(initError instanceof Error ? initError.message : "renderer failed to start");
      onMapLoadRef.current?.();
      return;
    }
    setMap(instance);

    // Expose the map instance for E2E testing (repo-detail drill-down clicks).
    // Read-only debug hook; does not affect the rendered UI.
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__devatlasMap = instance;
    }

    return () => {
      if (typeof window !== "undefined") {
        delete (window as unknown as Record<string, unknown>).__devatlasMap;
      }
      instance.remove();
    };
  }, []);

  useEffect(() => {
    if (onReady) {
      onReady({
        flyTo: (center, zoom, pitch = 45, bearing = 0) => {
          if (map) {
            map.flyTo({ center, zoom, pitch, bearing, duration: 4000, essential: true });
          }
        },
        resetView: () => {
          if (map) {
            map.flyTo({ center: [78.9629, 20.5937], zoom: 4.5, pitch: 55, bearing: -15, duration: 3000 });
          }
        },
        playStory: async (steps, onStep) => {
          const state = storyState.current;
          // Cancel any in-flight story before starting a new one.
          state.cancelled = true;
          state.resumeResolve?.();
          state.resumeResolve = null;
          if (map) map.stop();

          state.cancelled = false;
          state.paused = false;
          state.skip = false;
          state.running = true;
          state.steps = steps;
          state.index = 0;
          state.onStep = onStep;

          for (let i = 0; i < steps.length; i++) {
            if (state.cancelled) break;
            state.index = i;
            const step = steps[i];
            onStep(step.title);
            map?.flyTo({
              center: step.center,
              zoom: step.zoom,
              pitch: step.pitch || 60,
              bearing: step.bearing || (Math.random() * 40 - 20),
              duration: 6000,
              essential: true,
            });
            // Wait for the fly + dwell, honouring pause/resume/skip/cancel.
            await waitForStep(state);
          }
          if (!state.cancelled) {
            onStep("End");
          }
          state.running = false;
        },
        pauseStory: () => {
          const state = storyState.current;
          if (state.running && !state.paused) {
            state.paused = true;
          }
        },
        resumeStory: () => {
          const state = storyState.current;
          if (state.running && state.paused) {
            state.paused = false;
            state.resumeResolve?.();
            state.resumeResolve = null;
          }
        },
        skipStory: () => {
          const state = storyState.current;
          if (!state.running) return;
          state.skip = true;
          // If paused, unblock the wait so the skip can take effect.
          state.resumeResolve?.();
          state.resumeResolve = null;
          if (map) map.stop();
        },
        stopStory: () => {
          const state = storyState.current;
          state.cancelled = true;
          state.paused = false;
          state.resumeResolve?.();
          state.resumeResolve = null;
          if (map) map.stop();
          state.onStep?.("End");
          state.running = false;
        },
      });
    }
  }, [map, onReady]);

  // Wire point clicks -> repository detail drill-down.
  useEffect(() => {
    if (!map) return;

    const handlePointClick = (e: MapLayerMouseEvent) => {
      const clicked = e.features;
      if (!clicked || clicked.length === 0) return;
      const repoId = clicked[0]?.properties?.id;
      if (repoId && onRepositoryClick) {
        onRepositoryClick(repoId);
      }
    };
    const handleEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", "repositories-circle", handlePointClick);
    map.on("click", "repositories-glow", handlePointClick);
    map.on("mouseenter", "repositories-circle", handleEnter);
    map.on("mouseleave", "repositories-circle", handleLeave);

    return () => {
      map.off("click", "repositories-circle", handlePointClick);
      map.off("click", "repositories-glow", handlePointClick);
      map.off("mouseenter", "repositories-circle", handleEnter);
      map.off("mouseleave", "repositories-circle", handleLeave);
    };
  }, [map, onRepositoryClick]);

  // Per-repository tooltip. The activity line is labelled by its true source so
  // a stars-derived estimate is never presented as measured activity.
  useEffect(() => {
    if (!map) return;

    const handleMove = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      setHovered({
        x: e.point?.x ?? 0,
        y: e.point?.y ?? 0,
        properties: feature.properties as GeoJSONFeature["properties"],
      });
    };
    const handleOut = () => setHovered(null);

    map.on("mousemove", "repositories-circle", handleMove);
    map.on("mouseleave", "repositories-circle", handleOut);

    return () => {
      map.off("mousemove", "repositories-circle", handleMove);
      map.off("mouseleave", "repositories-circle", handleOut);
    };
  }, [map]);

  const displayFeatures = useMemo(() => {
    return features.map((feature) => {
      // Use the real classified domain for category + color. Uncategorized
      // repositories get the neutral category/color — never a fake domain.
      const domain = getFeatureDomain(feature.properties.classification);
      const category = getFeatureCategory(feature.properties.classification);
      const color = getDomainColor(feature.properties.classification);

      return {
        type: "Feature" as const,
        geometry: feature.geometry,
        properties: {
          ...feature.properties,
          domain,
          category,
          color,
        },
      };
    });
  }, [features]);

  // If the data source stays silent with nothing plotted, say so rather than
  // spinning forever.
  useEffect(() => {
    if (!loading || features.length > 0) return;
    const timeout = setTimeout(() => setSourceUnresponsive(true), 5000);
    return () => clearTimeout(timeout);
  }, [loading, features.length]);

  // Which metric the markers are weighted by — aggregated across the plotted
  // repositories, never assumed.
  const activitySource = useMemo<ActivitySource | "mixed" | null>(() => {
    if (displayFeatures.length === 0) return null;
    const measured = displayFeatures.filter(
      (feature) => resolveActivitySource(feature.properties) === "github_events"
    ).length;
    if (measured === displayFeatures.length) return "github_events";
    if (measured === 0) return "stars_estimate";
    return "mixed";
  }, [displayFeatures]);

  useEffect(() => {
    if (!map || loading) return;
    const sourceId = "repositories";

    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: displayFeatures,
      });
      return;
    }

    const addLayers = () => {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: displayFeatures,
          },
        });

        // Ambient Heatmap for large-scale view
        map.addLayer({
          id: "repositories-heat",
          type: "heatmap",
          source: sourceId,
          maxzoom: 9,
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["get", "activity_score"], 0, 0, 100, 1],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 9, 3],
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0, "rgba(0,0,0,0)",
              0.2, "rgba(79, 139, 255, 0.4)",
              0.4, "rgba(34, 211, 238, 0.6)",
              0.6, "rgba(139, 92, 246, 0.7)",
              0.8, "rgba(255, 181, 71, 0.8)",
              1, "rgba(255, 255, 255, 0.9)"
            ],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 4, 9, 30],
            "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 4, 1, 8, 0],
          },
        });

        // Outer Glow Effect for Nodes
        map.addLayer({
          id: "repositories-glow",
          type: "circle",
          source: sourceId,
          minzoom: 5,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 12, 25],
            "circle-color": ["get", "color"],
            "circle-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0, 7, 0.5, 12, 0.1],
            "circle-blur": 1.5,
          },
        });

        // Core Point Node
        map.addLayer({
          id: "repositories-circle",
          type: "circle",
          source: sourceId,
          minzoom: 6,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 1.5, 12, 6],
            "circle-color": ["get", "color"],
            "circle-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0, 8, 1],
            "circle-stroke-width": 1,
            "circle-stroke-color": "rgba(255, 255, 255, 0.5)",
          },
        });

        if (onMapLoad) onMapLoad();
      }
    };

    if (map.loaded()) {
      addLayers();
    } else {
      map.on("load", addLayers);
      return () => {
        map.off("load", addLayers);
      };
    }
  }, [map, displayFeatures, loading, onMapLoad]);

  const showNoData =
    !mapInitError &&
    displayFeatures.length === 0 &&
    (!loading || sourceUnresponsive || Boolean(error));
  const hoveredSource: ActivitySource | null = hovered
    ? resolveActivitySource(hovered.properties)
    : null;

  return (
    <div className="relative w-full h-full bg-[#050816]">
      <div id="devatlas-map" className="w-full h-full" />

      {/* Per-repository tooltip: the activity metric is labelled by its source. */}
      {hovered && !mapInitError && (
        <div
          data-testid="map-repo-tooltip"
          data-activity-source={hoveredSource}
          className="pointer-events-none absolute z-20 max-w-[240px] rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur"
          style={{ left: hovered.x + 14, top: hovered.y + 14 }}
        >
          <p className="text-xs font-semibold text-white truncate">
            {hovered.properties.name || hovered.properties.full_name || "Repository"}
          </p>
          {hovered.properties.full_name && (
            <p className="text-[10px] text-slate-400 truncate">{hovered.properties.full_name}</p>
          )}
          <p className="mt-1 text-[10px] text-slate-300">
            {hovered.properties.language || "Unknown language"} · {formatCount(hovered.properties.stars)} stars
          </p>
          <p className="mt-1 text-[10px]" data-testid="map-tooltip-activity">
            <span className="font-semibold text-indigo-300">
              {hoveredSource ? activityMetricLabel(hoveredSource) : "stars estimate"}
            </span>
            <span className="text-slate-400">
              {hoveredSource === "github_events"
                ? typeof hovered.properties.push_count_30d === "number"
                  ? ` — ${formatCount(hovered.properties.push_count_30d)} push events, measured from GitHub`
                  : " — measured from GitHub push events (last 30 days)"
                : " — derived from stars, not measured push activity"}
            </span>
          </p>
        </div>
      )}

      {/* Metric provenance legend: what the marker weight means on this map. */}
      {activitySource && !mapInitError && (
        <div
          data-testid="map-activity-source"
          data-activity-source={activitySource}
          className="pointer-events-none absolute bottom-4 right-4 z-10 max-w-[280px] rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 backdrop-blur"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Marker weight
          </p>
          <p className="text-xs font-medium text-slate-200">
            {activitySource === "github_events" && "pushes / 30d"}
            {activitySource === "stars_estimate" && "stars estimate"}
            {activitySource === "mixed" && "pushes / 30d where published, stars estimate otherwise"}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {activitySource === "github_events" &&
              "Measured from GitHub push events in the last 30 days."}
            {activitySource === "stars_estimate" &&
              "Derived from star counts — not measured push activity."}
            {activitySource === "mixed" &&
              "Some repositories have no push data yet; their weight is estimated."}
          </p>
        </div>
      )}

      {/* Explicit empty state — the map shell never pretends it has data. */}
      {showNoData && (
        <div
          data-testid="no-data-state"
          role="status"
          className="pointer-events-none absolute left-1/2 top-24 z-10 w-full max-w-sm -translate-x-1/2 rounded-2xl border border-amber-500/30 bg-slate-900/85 px-4 py-3 text-center backdrop-blur"
        >
          <p className="text-sm font-semibold text-amber-200">No data yet</p>
          <p className="mt-1 text-xs text-slate-400">
            No repository locations are available in this build&apos;s data source. The map
            fills in automatically as soon as the sync publishes repositories.
          </p>
          {error ? (
            <p className="mt-1 text-[10px] text-slate-500">Data source: {error}</p>
          ) : sourceUnresponsive ? (
            <p className="mt-1 text-[10px] text-slate-500">
              Still waiting for the data source to respond.
            </p>
          ) : null}
        </div>
      )}

      {/* The WebGL renderer could not start — say so, keep the shell usable. */}
      {mapInitError && (
        <div
          data-testid="map-init-error"
          role="status"
          className="pointer-events-none absolute left-1/2 top-24 z-10 w-full max-w-sm -translate-x-1/2 rounded-2xl border border-amber-500/30 bg-slate-900/85 px-4 py-3 text-center backdrop-blur"
        >
          <p className="text-sm font-semibold text-amber-200">Map renderer unavailable</p>
          <p className="mt-1 text-xs text-slate-400">
            The WebGL map could not start in this browser ({mapInitError}). Statistics panels
            remain available.
          </p>
        </div>
      )}
    </div>
  );
};

export default DeveloperMap;
