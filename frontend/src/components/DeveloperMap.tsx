"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { api } from "@/lib/api";
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
    language: string | null;
    activity_score: number;
    classification: Record<string, any> | null;
  };
};

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
  const [features, setFeatures] = useState<GeoJSONFeature[]>([]);
  const [loading, setLoading] = useState(true);

  // Load geospatial activity from the API. Reload whenever the selected
  // domain filter or Time Machine year changes. An AbortController cancels
  // any in-flight request when the filter/year changes or the map unmounts;
  // the `cancelled` flag guards against stale responses applying state.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);

    api
      .getGeospatialActivity("68.1866,6.5546,97.4026,35.6745", {
        domain: activeFilter,
        year,
        limit: 5000,
        signal: controller.signal,
      })
      .then((data) => {
        if (!cancelled) {
          setFeatures((data.features || []) as GeoJSONFeature[]);
          setLoading(false);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          console.error("Map fetch error:", fetchError);
          setFeatures([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeFilter, year]);

  const [map, setMap] = useState<maplibregl.Map | null>(null);

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
    const instance = new maplibregl.Map({
      container: "devatlas-map",
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [0, 0], // Start from space (0,0)
      zoom: 0,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });
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

    const handlePointClick = (e: maplibregl.MapLayerMouseEvent) => {
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

  useEffect(() => {
    if (!map || loading) return;
    const sourceId = "repositories";

    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
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

  return (
    <div className="w-full h-full bg-[#050816]">
      <div id="devatlas-map" className="w-full h-full" />
    </div>
  );
};

export default DeveloperMap;
