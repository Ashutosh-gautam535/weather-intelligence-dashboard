/* Atmos Weather Intelligence — vanilla JavaScript */
"use strict";

const API = {
  geocoding: "https://geocoding-api.open-meteo.com/v1/search",
  forecast: "https://api.open-meteo.com/v1/forecast"
};

const state = {
  location: { name: "Bhopal", admin1: "Madhya Pradesh", country: "India", latitude: 23.2599, longitude: 77.4126, timezone: "Asia/Kolkata" },
  weather: null,
  unit: localStorage.getItem("atmos-unit") || "c",
  theme: localStorage.getItem("atmos-theme") || "dark",
  recent: JSON.parse(localStorage.getItem("atmos-recent") || "[]"),
  controller: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const weatherCodes = {
  0: ["Clear sky", "☀️"], 1: ["Mainly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Depositing rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Moderate drizzle", "🌦️"], 55: ["Dense drizzle", "🌧️"],
  56: ["Light freezing drizzle", "🌧️"], 57: ["Dense freezing drizzle", "🌧️"],
  61: ["Slight rain", "🌦️"], 63: ["Moderate rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  66: ["Light freezing rain", "🌧️"], 67: ["Heavy freezing rain", "🌧️"],
  71: ["Slight snowfall", "🌨️"], 73: ["Moderate snowfall", "🌨️"], 75: ["Heavy snowfall", "❄️"], 77: ["Snow grains", "🌨️"],
  80: ["Rain showers", "🌦️"], 81: ["Moderate rain showers", "🌧️"], 82: ["Violent rain showers", "⛈️"],
  85: ["Snow showers", "🌨️"], 86: ["Heavy snow showers", "❄️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm with hail", "⛈️"], 99: ["Thunderstorm with heavy hail", "⛈️"]
};

function describeWeather(code) {
  return weatherCodes[code] || ["Conditions unavailable", "🌡️"];
}
function celsiusToFahrenheit(celsius) { return (celsius * 9 / 5) + 32; }
function temperature(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const converted = state.unit === "f" ? celsiusToFahrenheit(Number(value)) : Number(value);
  return `${Math.round(converted)}°`;
}
function formatTime(iso, options = {}) {
  if (!iso) return "--:--";
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", ...options, timeZone: state.location.timezone || undefined }).format(date);
}
function formatDate(iso, options = {}) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: state.location.timezone || undefined, ...options }).format(new Date(iso));
}
function showMessage(message, isError = false) {
  const bar = $("#message-bar");
  bar.textContent = message;
  bar.classList.toggle("error", isError);
  bar.hidden = false;
}
function clearMessage() {
  const bar = $("#message-bar");
  bar.hidden = true;
  bar.textContent = "";
  bar.classList.remove("error");
}
function setLoading(loading) {
  $("#search-button").disabled = loading;
  $("#search-button").textContent = loading ? "Loading…" : "Search ↗";
  $("#updated-label").textContent = loading ? "Refreshing weather…" : $("#updated-label").textContent;
}
function safeNumber(value, suffix = "") {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? "—" : `${Math.round(Number(value))}${suffix}`;
}

async function searchCity(query) {
  const url = new URL(API.geocoding);
  url.search = new URLSearchParams({ name: query.trim(), count: "8", language: "en", format: "json" });
  const response = await fetch(url);
  if (!response.ok) throw new Error("City search is temporarily unavailable. Please try again.");
  const data = await response.json();
  return data.results || [];
}

async function fetchWeather(location) {
  if (state.controller) state.controller.abort();
  state.controller = new AbortController();

  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: location.timezone || "auto",
    forecast_days: "7",
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure",
    hourly: "temperature_2m,precipitation_probability,weather_code,visibility",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max",
    temperature_unit: "celsius",
    wind_speed_unit: "kmh"
  });

  const response = await fetch(`${API.forecast}?${params}`, { signal: state.controller.signal });
  if (!response.ok) throw new Error("Weather service returned an error. Please try again shortly.");
  const data = await response.json();
  if (!data.current || !data.daily || !data.hourly) throw new Error("Weather data was incomplete. Try another city.");
  return data;
}

function rememberLocation(location) {
  const item = {
    name: location.name,
    admin1: location.admin1 || "",
    country: location.country || "",
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: location.timezone || "auto"
  };
  state.recent = [item, ...state.recent.filter((city) => city.name.toLowerCase() !== item.name.toLowerCase())].slice(0, 5);
  localStorage.setItem("atmos-recent", JSON.stringify(state.recent));
}

async function loadLocation(location) {
  clearMessage();
  setLoading(true);
  state.location = location;
  try {
    const data = await fetchWeather(location);
    state.weather = data;
    rememberLocation(location);
    renderDashboard();
    $("#city-input").value = "";
  } catch (error) {
    if (error.name !== "AbortError") showMessage(error.message || "Could not load weather. Check your connection and try again.", true);
  } finally {
    setLoading(false);
  }
}

function locationLabel(location) {
  return [location.name, location.admin1, location.country].filter(Boolean).filter((part, index, arr) => arr.indexOf(part) === index).join(", ");
}

function renderDashboard() {
  const data = state.weather;
  if (!data) return;
  const current = data.current;
  const daily = data.daily;
  const hourly = data.hourly;
  const [condition, icon] = describeWeather(current.weather_code);
  const dayIndex = Math.max(0, daily.time.indexOf(current.time.slice(0, 10)));

  $("#location-name").textContent = locationLabel(state.location);
  $("#current-date").textContent = formatDate(current.time);
  $("#current-temp").textContent = temperature(current.temperature_2m).replace("°", "");
  $("#current-degree").textContent = state.unit === "c" ? "°C" : "°F";
  $("#current-condition").textContent = condition;
  $("#feels-like").textContent = temperature(current.apparent_temperature);
  $("#weather-art").textContent = icon;
  $("#today-high").textContent = temperature(daily.temperature_2m_max[dayIndex]);
  $("#today-low").textContent = temperature(daily.temperature_2m_min[dayIndex]);
  $("#rain-chance").textContent = safeNumber(daily.precipitation_probability_max?.[dayIndex], "%");
  $("#humidity").innerHTML = `${safeNumber(current.relative_humidity_2m)}<small>%</small>`;
  $("#humidity-meter").style.width = `${Math.min(100, Math.max(0, current.relative_humidity_2m || 0))}%`;
  $("#wind").innerHTML = `${safeNumber(current.wind_speed_10m)}<small> km/h</small>`;
  $("#wind-direction").textContent = `Direction ${safeNumber(current.wind_direction_10m)}°`;
  $("#pressure").innerHTML = `${safeNumber(current.surface_pressure)}<small> hPa</small>`;
  const hourlyIndex = Math.max(0, hourly.time.findIndex((time) => time >= current.time.slice(0, 13)));
  const visibilityMeters = hourly.visibility?.[hourlyIndex];
  $("#visibility").innerHTML = `${visibilityMeters == null ? "—" : (visibilityMeters / 1000).toFixed(1)}<small> km</small>`;
  $("#updated-label").textContent = `Updated ${formatTime(current.time)}`;
  $("#forecast-date").textContent = formatDate(current.time, { weekday: "short", month: "short", day: "numeric" });
  $("#sunrise").textContent = formatTime(daily.sunrise[dayIndex]);
  $("#sunset").textContent = formatTime(daily.sunset[dayIndex]);
  $("#daylight-note").textContent = `Local daylight schedule for ${state.location.name}. Times shown in the location's time zone.`;
  renderHourly(hourly, current.time);
  renderWeekly(daily);
  renderInsight(current, daily, dayIndex);
  drawTemperatureChart(hourly, current.time);
  updateUnitToggle();
}

function renderHourly(hourly, currentTime) {
  const list = $("#hourly-list");
  const currentHour = currentTime.slice(0, 13);
  let start = hourly.time.findIndex((time) => time.slice(0, 13) >= currentHour);
  if (start < 0) start = 0;
  const indexes = Array.from({ length: 6 }, (_, index) => Math.min(start + index * 2, hourly.time.length - 1));
  list.innerHTML = indexes.map((index, position) => {
    const [condition, icon] = describeWeather(hourly.weather_code[index]);
    const timeLabel = position === 0 ? "Now" : formatTime(hourly.time[index]);
    const rain = hourly.precipitation_probability?.[index];
    return `<article class="hour-card" title="${condition}">
      <div class="hour-time">${timeLabel}</div>
      <div class="hour-icon" aria-hidden="true">${icon}</div>
      <div class="hour-temp">${temperature(hourly.temperature_2m[index])}</div>
      <div class="hour-rain">☂ ${rain == null ? "—" : Math.round(rain) + "%"} rain</div>
    </article>`;
  }).join("");
}

function renderWeekly(daily) {
  const list = $("#weekly-list");
  const allTemps = [...daily.temperature_2m_max, ...daily.temperature_2m_min].filter(Number.isFinite);
  const minTemp = Math.min(...allTemps);
  const maxTemp = Math.max(...allTemps);
  const span = Math.max(1, maxTemp - minTemp);

  list.innerHTML = daily.time.map((date, index) => {
    const [condition, icon] = describeWeather(daily.weather_code[index]);
    const low = daily.temperature_2m_min[index];
    const high = daily.temperature_2m_max[index];
    const left = ((low - minTemp) / span) * 100;
    const width = Math.max(8, ((high - low) / span) * 100);
    const dayName = index === 0 ? "Today" : new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone: state.location.timezone || undefined }).format(new Date(date + "T12:00:00"));
    const dateLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: state.location.timezone || undefined }).format(new Date(date + "T12:00:00"));
    return `<div class="day-row">
      <div class="day-name">${dayName}<span class="day-date">${dateLabel}</span></div>
      <div class="day-icon" title="${condition}" aria-label="${condition}">${icon}</div>
      <div class="day-condition">${condition}</div>
      <div class="temp-range"><span>${temperature(high)}</span><div class="range-track"><span style="margin-left:${left}%;width:${width}%"></span></div><span class="low">${temperature(low)}</span></div>
    </div>`;
  }).join("");
}

function renderInsight(current, daily, index) {
  const code = current.weather_code;
  const rain = daily.precipitation_probability_max?.[index] ?? 0;
  const temp = current.temperature_2m;
  let title = "A good day to get outside";
  let copy = "Conditions look fairly comfortable. Check the hourly outlook before making plans.";
  let icon = "🌤️";

  if (code >= 95) {
    title = "Thunderstorm conditions"; copy = "Thunderstorms are in the forecast. Consider delaying outdoor plans and follow local weather guidance."; icon = "⛈️";
  } else if (rain >= 60 || (code >= 61 && code <= 82)) {
    title = "Keep an umbrella nearby"; copy = `Rain chances are around ${Math.round(rain)}%. A light waterproof layer may be useful if you're heading out.`; icon = "🌧️";
  } else if (temp >= 34) {
    title = "It's a hot day"; copy = "Consider taking breaks in the shade, drinking water, and limiting strenuous outdoor activity during the hottest hours."; icon = "☀️";
  } else if (temp <= 8) {
    title = "Cool conditions"; copy = "A warm layer may make outdoor plans more comfortable, especially in the morning and evening."; icon = "🧥";
  } else if (code === 0 || code === 1) {
    title = "Clear skies ahead"; copy = "Mostly clear conditions are expected. Sunglasses may be useful during brighter hours."; icon = "☀️";
  }
  $("#insight-icon").textContent = icon;
  $("#insight-title").textContent = title;
  $("#insight-copy").textContent = copy;
}

function drawTemperatureChart(hourly, currentTime) {
  const canvas = $("#temperature-chart");
  const context = canvas.getContext("2d");
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  context.scale(dpr, dpr);
  context.clearRect(0, 0, width, height);

  const currentHour = currentTime.slice(0, 13);
  let start = hourly.time.findIndex((time) => time.slice(0, 13) >= currentHour);
  if (start < 0) start = 0;
  const values = Array.from({ length: 12 }, (_, i) => hourly.temperature_2m[Math.min(start + i * 2, hourly.temperature_2m.length - 1)]);
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return;
  const min = Math.min(...valid) - 2;
  const max = Math.max(...valid) + 2;
  const padding = { left: 12, right: 12, top: 15, bottom: 25 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = (i) => padding.left + (plotWidth * i / Math.max(1, values.length - 1));
  const y = (v) => padding.top + (max - v) / Math.max(1, max - min) * plotHeight;
  const styles = getComputedStyle(document.body);
  const accent = styles.getPropertyValue("--accent").trim() || "#64e4d2";
  const muted = styles.getPropertyValue("--muted").trim() || "#94a4bd";
  const border = styles.getPropertyValue("--border").trim() || "rgba(165,188,220,.12)";

  context.font = '10px "DM Sans", sans-serif';
  context.strokeStyle = border;
  context.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const gy = padding.top + (plotHeight * i / 2);
    context.beginPath(); context.moveTo(padding.left, gy); context.lineTo(width - padding.right, gy); context.stroke();
  }
  const points = values.map((value, i) => ({ x: x(i), y: y(value), value }));
  context.beginPath();
  points.forEach((point, i) => i === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
  context.lineTo(points[points.length - 1].x, height - padding.bottom);
  context.lineTo(points[0].x, height - padding.bottom);
  context.closePath();
  const gradient = context.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, "rgba(100,228,210,.22)");
  gradient.addColorStop(1, "rgba(100,228,210,0)");
  context.fillStyle = gradient; context.fill();

  context.beginPath();
  points.forEach((point, i) => i === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
  context.strokeStyle = accent; context.lineWidth = 2.5; context.lineJoin = "round"; context.stroke();

  points.forEach((point, i) => {
    if (i % 2 !== 0) return;
    context.beginPath(); context.arc(point.x, point.y, 3, 0, Math.PI * 2); context.fillStyle = accent; context.fill();
    context.fillStyle = muted; context.textAlign = "center";
    context.fillText(temperature(point.value), point.x, point.y - 9);
    const timeIndex = Math.min(start + i * 2, hourly.time.length - 1);
    context.fillText(formatTime(hourly.time[timeIndex]), point.x, height - 6);
  });
}

function updateUnitToggle() {
  $$(".unit-toggle span").forEach((span) => span.classList.toggle("unit-active", span.dataset.unit === state.unit));
}
function setTheme(theme) {
  state.theme = theme;
  document.body.classList.toggle("light-theme", theme === "light");
  localStorage.setItem("atmos-theme", theme);
  $("#theme-toggle").textContent = theme === "light" ? "☾" : "☼";
  $("#theme-toggle").setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
  if (state.weather) requestAnimationFrame(() => drawTemperatureChart(state.weather.hourly, state.weather.current.time));
}
function renderRecentCities() {
  // Recent cities are stored locally; search remains keyboard-friendly without injected HTML.
  if (!state.recent.length) return;
  const input = $("#city-input");
  input.setAttribute("list", "recent-cities");
  let datalist = $("#recent-cities");
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = "recent-cities";
    input.after(datalist);
  }
  datalist.replaceChildren(...state.recent.map((city) => {
    const option = document.createElement("option");
    option.value = city.name;
    option.label = locationLabel(city);
    return option;
  }));
}

async function handleSearch(event) {
  event.preventDefault();
  const query = $("#city-input").value.trim();
  if (query.length < 2) {
    showMessage("Enter at least two characters to search for a city.", true);
    return;
  }
  setLoading(true);
  clearMessage();
  try {
    const results = await searchCity(query);
    if (!results.length) {
      showMessage(`No city found for “${query}”. Check the spelling or try a nearby city.`, true);
      return;
    }
    const exact = results.find((item) => item.name.toLowerCase() === query.toLowerCase()) || results[0];
    await loadLocation(exact);
  } catch (error) {
    showMessage(error.message || "City search failed. Check your internet connection.", true);
  } finally {
    setLoading(false);
  }
}

function useMyLocation() {
  if (!navigator.geolocation) {
    showMessage("Geolocation is not supported by this browser. Search for a city instead.", true);
    return;
  }
  clearMessage();
  $("#location-button").disabled = true;
  $("#location-button").textContent = "Finding location…";
  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      const { latitude, longitude } = position.coords;
      const location = { name: "Your location", latitude, longitude, timezone: "auto", country: "" };
      await loadLocation(location);
    } finally {
      $("#location-button").disabled = false;
      $("#location-button").innerHTML = "<span>◎</span> Use my location";
    }
  }, (error) => {
    const message = error.code === 1 ? "Location permission was denied. You can search for a city instead." : "Could not determine your location. Try city search instead.";
    showMessage(message, true);
    $("#location-button").disabled = false;
    $("#location-button").innerHTML = "<span>◎</span> Use my location";
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}

function init() {
  $("#year").textContent = new Date().getFullYear();
  setTheme(state.theme);
  updateUnitToggle();
  renderRecentCities();

  $("#search-form").addEventListener("submit", handleSearch);
  $("#location-button").addEventListener("click", useMyLocation);
  $("#unit-toggle").addEventListener("click", () => {
    state.unit = state.unit === "c" ? "f" : "c";
    localStorage.setItem("atmos-unit", state.unit);
    updateUnitToggle();
    if (state.weather) renderDashboard();
  });
  $("#theme-toggle").addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));
  $("#menu-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $$(".nav-link").forEach((link) => link.addEventListener("click", () => $("#sidebar").classList.remove("open")));
  window.addEventListener("resize", () => {
    if (state.weather) drawTemperatureChart(state.weather.hourly, state.weather.current.time);
  });
  window.addEventListener("storage", (event) => {
    if (event.key === "atmos-theme" && event.newValue) setTheme(event.newValue);
  });

  loadLocation(state.location);
}
document.addEventListener("DOMContentLoaded", init);
