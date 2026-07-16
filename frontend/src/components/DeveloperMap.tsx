"use client";

import { useEffect, useMemo, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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

type GeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

// Helper to assign a mock category to a repository for visualization
const getCategoryForFeature = (feature: GeoJSONFeature) => {
  const classification = feature.properties.classification;
  if (classification && classification.domain) {
    return classification.domain; // Or map it to 'AI', etc.
  }
  
  const hash = feature.properties.id.split('').reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  const categories = ["AI", "Cybersecurity", "Healthcare", "Robotics", "Web3"];
  return categories[Math.abs(hash) % categories.length];
};

export interface DeveloperMapRef {
  flyTo: (center: [number, number], zoom: number, pitch?: number, bearing?: number) => void;
  resetView: () => void;
  playStory: (steps: { center: [number, number], zoom: number, title: string, pitch?: number, bearing?: number }[], onStep: (title: string) => void) => void;
}

interface DeveloperMapProps {
  activeFilter?: string;
  onMapLoad?: () => void;
  onReady?: (actions: DeveloperMapRef) => void;
}

const DeveloperMap = ({ activeFilter = "All Projects", onMapLoad, onReady }: DeveloperMapProps) => {
  const [features, setFeatures] = useState<GeoJSONFeature[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/v1/geospatial/activity?bbox=-180,-90,180,90&limit=5000")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load activity data");
        return response.json();
      })
      .then((data: GeoJSONFeatureCollection) => {
        if (!cancelled) {
          setFeatures(data.features || []);
          setLoading(false);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          console.error("Map fetch error:", fetchError);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [map, setMap] = useState<maplibregl.Map | null>(null);

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

    return () => {
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
          console.log("playStory called, map is:", map ? "exists" : "null");
          if (!map) {
            console.error("playStory failed: map is null!");
            return;
          }
          for (const step of steps) {
            console.log("playStory step:", step.title);
            onStep(step.title);
            map.flyTo({
              center: step.center,
              zoom: step.zoom,
              pitch: step.pitch || 60,
              bearing: step.bearing || (Math.random() * 40 - 20),
              duration: 6000,
              essential: true
            });
            // Wait for 8 seconds per step (fly + pause)
            await new Promise(resolve => setTimeout(resolve, 8000));
          }
          onStep("End");
        }
      });
    }
  }, [map, onReady]);

  useEffect(() => {
    if (!map || loading) return;
    const sourceId = "repositories";
    
    // Filter repositories based on the activeFilter (if not "All Projects")
    const filteredFeatures = features.filter(feature => {
      if (activeFilter === "All Projects") return true;
      const category = getCategoryForFeature(feature);
      // Rough matching
      return category.toLowerCase().includes(activeFilter.toLowerCase()) || activeFilter.toLowerCase().includes(category.toLowerCase());
    });

    const displayFeatures = filteredFeatures.map((feature) => {
      const category = getCategoryForFeature(feature);
      
      let color = "#38bdf8"; 
      const lowerCat = category.toLowerCase();
      if (lowerCat.includes("ai") || lowerCat.includes("machine learning")) color = "#8B5CF6"; 
      else if (lowerCat.includes("cyber") || lowerCat.includes("security")) color = "#4F8BFF"; 
      else if (lowerCat.includes("health") || lowerCat.includes("medical")) color = "#10B981"; 
      else if (lowerCat.includes("robotics") || lowerCat.includes("hardware")) color = "#FFB547"; 
      else if (lowerCat.includes("web3") || lowerCat.includes("blockchain")) color = "#EC4899"; 

      return {
        type: "Feature" as const,
        geometry: feature.geometry,
        properties: { 
          ...feature.properties,
          category,
          color
        },
      };
    });

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
  }, [map, features, loading, activeFilter, onMapLoad]);

  return (
    <div className="w-full h-full bg-[#050816]">
      <div id="devatlas-map" className="w-full h-full" />
    </div>
  );
};

export default DeveloperMap;
