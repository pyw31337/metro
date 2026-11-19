"use client";

import { useEffect, useState } from "react";

type WeatherState = { temperature: number | null; label: string; wind: number | null; loading: boolean };

function labelFor(code: number | undefined): string {
  if (code == null) return "관측 대기";
  if (code === 0) return "맑음";
  if (code <= 3) return "구름 조금";
  if (code <= 48) return "안개";
  if (code <= 67) return "비";
  if (code <= 77) return "눈";
  if (code <= 82) return "소나기";
  return "뇌우";
}

export function useNearbyWeather(location: [number, number] | null): WeatherState {
  const [state, setState] = useState<WeatherState>({ temperature: null, label: "위치 권한 대기", wind: null, loading: false });
  useEffect(() => {
    if (!location) { setState({ temperature: null, label: "위치 권한 대기", wind: null, loading: false }); return; }
    const controller = new AbortController();
    setState(prev => ({ ...prev, loading: true }));
    const [latitude, longitude] = location;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : Promise.reject(new Error("weather")))
      .then(json => setState({
        temperature: typeof json.current?.temperature_2m === "number" ? Math.round(json.current.temperature_2m) : null,
        label: labelFor(json.current?.weather_code),
        wind: typeof json.current?.wind_speed_10m === "number" ? Math.round(json.current.wind_speed_10m) : null,
        loading: false,
      }))
      .catch(error => { if (error?.name !== "AbortError") setState(prev => ({ ...prev, label: "날씨를 불러오지 못함", loading: false })); });
    return () => controller.abort();
  }, [location?.[0], location?.[1]]);
  return state;
}

