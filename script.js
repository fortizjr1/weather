document.addEventListener('DOMContentLoaded', () => {
    const weatherContainer = document.getElementById('weather-container');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    const weatherDataEl = document.getElementById('weather-data');
    const refreshBtn = document.getElementById('refresh-btn');
    const unitToggleBtn = document.getElementById('unit-toggle');
    const currentLocationBtn = document.getElementById('current-location-btn');

    let isCelsius = false; // Default to Fahrenheit
    let currentWeatherData = null;
    let currentLocationName = '';

    // Initialize the app (Auto-fetch location)
    initApp();

    refreshBtn.addEventListener('click', () => {
        if (currentWeatherData && currentLocationName) {
            // Re-fetch with last known coordinates
            // But we don't have them stored globally easily without modifying updateUI
            // For now, re-init (current location) or re-search could be better
            // Let's just re-init current location for simplicity or keep existing behavior
            initApp();
        } else {
            initApp();
        }
    });
    unitToggleBtn.addEventListener('click', toggleUnit);

    // Search Events
    currentLocationBtn.addEventListener('click', initApp);

    function toggleUnit() {
        isCelsius = !isCelsius;
        if (currentWeatherData) {
            updateUI(currentWeatherData, currentLocationName);
        }
    }



    function handleSearch() {
        const query = locationInput.value.trim();
        if (!query) return;

        showLoading();
        hideError();
        weatherDataEl.classList.add('hidden');

        getCoordinates(query)
            .then(coords => {
                if (!coords) {
                    throw new Error('Location not found. Please try again.');
                }
                const { lat, lon, name } = coords;
                
                // Fetch weather and alerts
                return Promise.all([
                    fetchWeatherData(lat, lon),
                    fetchWeatherAlerts(lat, lon)
                ]).then(([weatherData, alertsData]) => {
                    currentWeatherData = weatherData;
                    currentLocationName = name; // Use name from search result
                    currentAlertsData = alertsData;
                    updateUI(weatherData, name);
                    updateAlertsUI(alertsData);
                });
            })
            .catch(error => {
                showError(error.message || 'Failed to fetch weather data.');
            })
            .finally(() => {
                hideLoading();
            });
    }

    async function getCoordinates(query) {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'SimpleWeatherApp/1.0'
                }
            });
            if (!response.ok) return null;
            const data = await response.json();
            
            if (data.length === 0) return null;
            
            return {
                lat: data[0].lat,
                lon: data[0].lon,
                name: data[0].display_name.split(',')[0] // Use first part of display name (usually city)
            };
        } catch (e) {
            console.warn('Geocoding failed', e);
            return null;
        }
    }

    function initApp() {
        showLoading();
        hideError();
        weatherDataEl.classList.add('hidden');

        if (!navigator.geolocation) {
            showError('Geolocation is not supported by your browser.');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                // Fetch weather and location name in parallel
                Promise.all([
                    fetchWeatherData(latitude, longitude),
                    fetchLocationName(latitude, longitude)
                ]).then(([weatherData, locationName]) => {
                    currentWeatherData = weatherData;
                    currentLocationName = locationName;
                    updateUI(weatherData, locationName);
                }).catch(error => {
                    showError(error.message || 'Failed to fetch data.');
                }).finally(() => {
                    hideLoading();
                });
            },
            (error) => {
                let msg = 'Unable to retrieve your location.';
                if (error.code === error.PERMISSION_DENIED) {
                    msg = 'Location permission denied. Please enable location access.';
                }
                showError(msg);
            }
        );
    }

    async function fetchWeatherData(lat, lon) {
        // Open-Meteo API
        // forecasting 8 days to ensure we have 5 days starting from day after tomorrow
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day,relative_humidity_2m,apparent_temperature,wind_speed_10m,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,wind_speed_10m_max,uv_index_max&hourly=temperature_2m,weather_code,is_day&timezone=auto&forecast_days=8`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Weather API not available.');
        }
        return await response.json();
    }


    async function fetchLocationName(lat, lon) {
        // Nominatim Reverse Geocoding (OpenStreetMap)
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'SimpleWeatherApp/1.0'
                }
            });
            if (!response.ok) return 'Unknown Location';
            const data = await response.json();

            // Try to find a suitable name: city, town, village, or suburb
            const addr = data.address;
            return addr.city || addr.town || addr.village || addr.suburb || addr.county || 'Your Location';
        } catch (e) {
            console.warn('Location name fetch failed', e);
            return 'Your Location';
        }
    }

    async function fetchWeatherAlerts(lat, lon) {
        // NWS API (Only works for US locations)
        // Returns null if failed or no alerts found (404/400 for non-US)
        const url = `https://api.weather.gov/alerts/active?point=${lat},${lon}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'SimpleWeatherApp/1.0'
                }
            });
            if (!response.ok) {
                // Non-US locations will likely return 404 or 400
                return null; 
            }
            return await response.json();
        } catch (e) {
            console.warn('Weather alerts fetch failed', e);
            return null;
        }
    }

    function updateAlertsUI(data) {
        const container = document.getElementById('advisory-container');
        container.innerHTML = ''; // Clear previous
        
        if (!data || !data.features || data.features.length === 0) {
            container.classList.add('hidden');
            return;
        }

        data.features.forEach(feature => {
            const props = feature.properties;
            const item = document.createElement('div');
            item.className = 'advisory-item';
            
            // Create inner HTML
            item.innerHTML = `
                <span class="advisory-icon">⚠️</span>
                <span class="advisory-text">${props.event}</span>
            `;
            
            container.appendChild(item);
        });

        container.classList.remove('hidden');
    }

    function updateUI(data, locationName) {
        const current = data.current;
        const daily = data.daily;
        const hourly = data.hourly;

        if (!current || !daily || !hourly) {
            console.error('Incomplete weather data', data);
            return;
        }

        // Update Location
        document.getElementById('location-name').textContent = locationName;

        // Update Temperature
        const tempC = current.temperature_2m;
        const tempDisplay = formatTemp(tempC);
        const unitDisplay = isCelsius ? '°C' : '°F';

        document.getElementById('temperature').textContent = `${tempDisplay}${unitDisplay}`;

        // Update High/Low
        const todayMax = formatTemp(daily.temperature_2m_max[0]);
        const todayMin = formatTemp(daily.temperature_2m_min[0]);
        document.getElementById('high-low').textContent = `H: ${todayMax}° L: ${todayMin}°`;

        // Update Description & Icon
        const weatherInfo = getWeatherDescription(current.weather_code, current.is_day);
        document.getElementById('description').textContent = weatherInfo.description;

        const iconCode = mapWmoToOwmIcon(current.weather_code, current.is_day);
        const iconEl = document.getElementById('weather-icon');
        iconEl.src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
        iconEl.classList.remove('hidden');

        // Update Sunrise/Sunset
        const sunriseTime = daily.sunrise ? formatTimeISO(daily.sunrise[0]) : '--:--';
        const sunsetTime = daily.sunset ? formatTimeISO(daily.sunset[0]) : '--:--';
        document.getElementById('sunrise-time').textContent = sunriseTime;
        document.getElementById('sunset-time').textContent = sunsetTime;

        // Update Day/Night Status
        const dayNightStatus = current.is_day ? 'Day' : 'Night';
        document.getElementById('day-night-status').textContent = dayNightStatus;

        // Update Extra Details
        document.getElementById('humidity').textContent = `${current.relative_humidity_2m}%`;

        // Wind Speed (API returns km/h)
        const windKmh = current.wind_speed_10m;
        const windDisplay = isCelsius ? `${Math.round(windKmh)} km/h` : `${Math.round(windKmh * 0.621371)} mph`;
        document.getElementById('wind-speed').textContent = windDisplay;

        // Feels Like
        const feelsLikeC = current.apparent_temperature;
        document.getElementById('feels-like').textContent = `${formatTemp(feelsLikeC)}°`;

        // Rain Chance (Today's max probability)
        const rainChance = daily.precipitation_probability_max ? daily.precipitation_probability_max[0] : 0;
        document.getElementById('rain-chance').textContent = `${rainChance}%`;

        // Visibility
        const visibilityMeters = current.visibility;
        let visibilityDisplay;
        if (isCelsius) {
            // km
            visibilityDisplay = `${(visibilityMeters / 1000).toFixed(1)} km`;
        } else {
            // miles
            visibilityDisplay = `${(visibilityMeters / 1609.34).toFixed(1)} mi`;
        }
        document.getElementById('visibility').textContent = visibilityDisplay;

        // UV Index
        const uvIndex = daily.uv_index_max ? daily.uv_index_max[0] : 0;
        document.getElementById('uv-index').textContent = uvIndex;

        // Render Hourly Forecast (Every 3 Hours)
        renderHourlyForecast(hourly);

        // Render Forecast
        renderForecast(daily);

        // Show data
        weatherDataEl.classList.remove('hidden');
    }

    function renderHourlyForecast(hourly) {
        const hourlyList = document.getElementById('hourly-list');
        hourlyList.innerHTML = ''; // Clear existing

        const now = new Date();
        const currentHour = now.getHours();

        // Find the index of the current hour or next hour in the hourly data
        let startIndex = 0;
        for (let i = 0; i < hourly.time.length; i++) {
            const time = new Date(hourly.time[i]);
            if (time >= now) {
                startIndex = i;
                break;
            }
        }

        // Display next 24 hours (8 items * 3 hours)
        let count = 0;
        for (let i = startIndex; i < hourly.time.length && count < 8; i += 3) {
            const timeStr = hourly.time[i];
            const tempC = hourly.temperature_2m[i];
            const code = hourly.weather_code[i];
            const isDay = hourly.is_day[i];

            const time = new Date(timeStr);
            const hourDisplay = time.toLocaleTimeString([], { hour: 'numeric', hour12: true });

            const temp = formatTemp(tempC);
            const iconCode = mapWmoToOwmIcon(code, isDay);
            const iconUrl = `https://openweathermap.org/img/wn/${iconCode}.png`;

            const item = document.createElement('div');
            item.className = 'hourly-item';

            item.innerHTML = `
                <div class="hourly-time">${hourDisplay}</div>
                <div class="hourly-icon">
                    <img src="${iconUrl}" alt="Icon">
                </div>
                <div class="hourly-temp">${temp}°</div>
            `;
            hourlyList.appendChild(item);
            count++;
        }
    }

    function renderForecast(daily) {
        const forecastList = document.getElementById('forecast-list');
        forecastList.innerHTML = ''; // Clear existing

        if (!daily.time) return;

        // Get today's date as YYYY-MM-DD string in local time
        // Get tomorrow's date for filtering
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);

        const tYear = tomorrow.getFullYear();
        const tMonth = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const tDay = String(tomorrow.getDate()).padStart(2, '0');
        const tomorrowStr = `${tYear}-${tMonth}-${tDay}`;

        let count = 0;

        for (let i = 0; i < daily.time.length; i++) {
            const dateStr = daily.time[i];

            // Exclude everything up to and including tomorrow to show "Next 5 Days" starting from day after tomorrow
            if (dateStr <= tomorrowStr) {
                continue;
            }

            if (count >= 5) break; // Limit to 5 days
            const maxTempC = daily.temperature_2m_max[i];
            const minTempC = daily.temperature_2m_min[i];
            const code = daily.weather_code[i];

            // New data fields (with safety checks)
            const precipProb = daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : 0;
            const windSpeedMax = daily.wind_speed_10m_max ? daily.wind_speed_10m_max[i] : 0;
            const sunrise = daily.sunrise ? formatTimeISO(daily.sunrise[i]) : '--:--';
            const sunset = daily.sunset ? formatTimeISO(daily.sunset[i]) : '--:--';

            // Format Day Name
            const date = new Date(dateStr);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });

            // Format Temps
            const maxTemp = formatTemp(maxTempC);
            const minTemp = formatTemp(minTempC);

            // Format Wind
            const windDisplay = isCelsius ? `${Math.round(windSpeedMax)} km/h` : `${Math.round(windSpeedMax * 0.621371)} mph`;

            // Icon
            const iconCode = mapWmoToOwmIcon(code, 1);
            const iconUrl = `https://openweathermap.org/img/wn/${iconCode}.png`;

            const item = document.createElement('div');
            item.className = 'forecast-item';

            // Make the item clickable
            item.onclick = function () {
                const details = this.querySelector('.forecast-details');
                details.classList.toggle('hidden');
                this.classList.toggle('expanded');
            };

            item.innerHTML = `
                <div class="forecast-summary">
                    <div class="forecast-day">${dayName}</div>
                    <div class="forecast-icon">
                        <img src="${iconUrl}" alt="Icon">
                    </div>
                    <div class="forecast-temp">
                        H: ${maxTemp}° <span class="min-temp">L: ${minTemp}°</span>
                    </div>
                </div>
                <div class="forecast-details hidden">
                    <div class="detail-row">
                        <span>Rain: ${precipProb}%</span>
                        <span>Wind: ${windDisplay}</span>
                    </div>
                    <div class="detail-row">
                        <span>Sunrise: ${sunrise}</span>
                        <span>Sunset: ${sunset}</span>
                    </div>
                </div>
            `;
            forecastList.appendChild(item);
            count++;
        }
    }

    function formatTemp(celsius) {
        if (isCelsius) {
            return Math.round(celsius);
        } else {
            return Math.round((celsius * 9 / 5) + 32);
        }
    }

    function formatTimeISO(isoString) {
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function getWeatherDescription(code, isDay) {
        // WMO Weather interpretation codes (WW)
        const codes = {
            0: 'Clear sky',
            1: 'Mainly clear',
            2: 'Partly cloudy',
            3: 'Overcast',
            45: 'Fog',
            48: 'Depositing rime fog',
            51: 'Light drizzle',
            53: 'Moderate drizzle',
            55: 'Dense drizzle',
            56: 'Light freezing drizzle',
            57: 'Dense freezing drizzle',
            61: 'Slight rain',
            63: 'Moderate rain',
            65: 'Heavy rain',
            66: 'Light freezing rain',
            67: 'Heavy freezing rain',
            71: 'Slight snow fall',
            73: 'Moderate snow fall',
            75: 'Heavy snow fall',
            77: 'Snow grains',
            80: 'Slight rain showers',
            81: 'Moderate rain showers',
            82: 'Violent rain showers',
            85: 'Slight snow showers',
            86: 'Heavy snow showers',
            95: 'Thunderstorm',
            96: 'Thunderstorm with slight hail',
            99: 'Thunderstorm with heavy hail'
        };

        return {
            description: codes[code] || 'Unknown'
        };
    }

    function mapWmoToOwmIcon(wmoCode, isDay) {
        const day = isDay ? 'd' : 'n';
        // Mapping WMO code to OpenWeatherMap icon code
        // 0 -> 01
        // 1,2,3 -> 02, 03, 04
        // 45,48 -> 50
        // 51-67 -> 09, 10
        // 71-77 -> 13
        // 80-82 -> 09
        // 85-86 -> 13
        // 95-99 -> 11

        if (wmoCode === 0) return `01${day}`;
        if (wmoCode === 1) return `02${day}`;
        if (wmoCode === 2) return `03${day}`;
        if (wmoCode === 3) return `04${day}`;
        if ([45, 48].includes(wmoCode)) return `50${day}`;
        if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(wmoCode)) return `10${day}`; // Rain
        if ([71, 73, 75, 77, 85, 86].includes(wmoCode)) return `13${day}`; // Snow
        if ([95, 96, 99].includes(wmoCode)) return `11${day}`; // Thunderstorm

        return `03${day}`; // Default
    }

    function showLoading() {
        loadingEl.classList.remove('hidden');
        document.getElementById('welcome-message').classList.add('hidden');
    }

    function hideLoading() {
        loadingEl.classList.add('hidden');
    }

    function showError(message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        hideLoading();
    }

    function hideError() {
        errorEl.classList.add('hidden');
    }
});
