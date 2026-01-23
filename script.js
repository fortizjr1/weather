document.addEventListener('DOMContentLoaded', () => {
    const weatherContainer = document.getElementById('weather-container');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    const weatherDataEl = document.getElementById('weather-data');
    const refreshBtn = document.getElementById('refresh-btn');
    const unitToggleBtn = document.getElementById('unit-toggle');

    let isCelsius = false; // Default to Fahrenheit
    let currentWeatherData = null;
    let currentLocationName = '';

    // Initialize the app
    initApp();

    refreshBtn.addEventListener('click', initApp);
    unitToggleBtn.addEventListener('click', toggleUnit);

    function toggleUnit() {
        isCelsius = !isCelsius;
        if (currentWeatherData) {
            updateUI(currentWeatherData, currentLocationName);
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
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day,relative_humidity_2m,apparent_temperature,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`;
        
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

    function updateUI(data, locationName) {
        const current = data.current;
        const daily = data.daily;

        // Update Location
        document.getElementById('location-name').textContent = locationName;

        // Update Temperature
        const tempC = current.temperature_2m;
        const tempDisplay = formatTemp(tempC);
        const unitDisplay = isCelsius ? '°C' : '°F';
        
        document.getElementById('temperature').textContent = `${tempDisplay}${unitDisplay}`;
        
        // Update Description & Icon
        const weatherInfo = getWeatherDescription(current.weather_code, current.is_day);
        document.getElementById('description').textContent = weatherInfo.description;
        
        const iconCode = mapWmoToOwmIcon(current.weather_code, current.is_day);
        const iconEl = document.getElementById('weather-icon');
        iconEl.src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
        iconEl.classList.remove('hidden');

        // Update Sunrise/Sunset
        document.getElementById('sunrise-time').textContent = formatTimeISO(daily.sunrise[0]);
        document.getElementById('sunset-time').textContent = formatTimeISO(daily.sunset[0]);

        // Update Extra Details
        document.getElementById('humidity').textContent = `${current.relative_humidity_2m}%`;
        
        // Wind Speed (API returns km/h)
        const windKmh = current.wind_speed_10m;
        const windDisplay = isCelsius ? `${Math.round(windKmh)} km/h` : `${Math.round(windKmh * 0.621371)} mph`;
        document.getElementById('wind-speed').textContent = windDisplay;

        // Feels Like
        const feelsLikeC = current.apparent_temperature;
        document.getElementById('feels-like').textContent = `${formatTemp(feelsLikeC)}°`;

        // Render Forecast
        renderForecast(daily);

        // Show data
        weatherDataEl.classList.remove('hidden');
    }

    function renderForecast(daily) {
        const forecastList = document.getElementById('forecast-list');
        forecastList.innerHTML = ''; // Clear existing

        // Daily arrays are aligned by index. We want the next 7 days (including today or starting tomorrow?)
        // Open-Meteo returns 7 days starting today by default.
        // Let's show all 7 days returned.
        
        for (let i = 0; i < daily.time.length; i++) {
            const dateStr = daily.time[i];
            const maxTempC = daily.temperature_2m_max[i];
            const minTempC = daily.temperature_2m_min[i];
            const code = daily.weather_code[i];
            
            // Format Day Name
            const date = new Date(dateStr);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }); // e.g., Monday
            
            // Format Temps
            const maxTemp = formatTemp(maxTempC);
            const minTemp = formatTemp(minTempC);

            // Icon
            const iconCode = mapWmoToOwmIcon(code, 1); // Assume day icon for forecast
            const iconUrl = `https://openweathermap.org/img/wn/${iconCode}.png`; // Small icon

            const item = document.createElement('div');
            item.className = 'forecast-item';
            item.innerHTML = `
                <div class="forecast-day">${dayName}</div>
                <div class="forecast-icon">
                    <img src="${iconUrl}" alt="Icon">
                </div>
                <div class="forecast-temp">
                    ${maxTemp}° <span class="min-temp">${minTemp}°</span>
                </div>
            `;
            forecastList.appendChild(item);
        }
    }

    function formatTemp(celsius) {
        if (isCelsius) {
            return Math.round(celsius);
        } else {
            return Math.round((celsius * 9/5) + 32);
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
