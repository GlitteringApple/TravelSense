import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SettingsContext = createContext(undefined);

export const SettingsProvider = ({ children }) => {
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [engineType, setEngineType] = useState('petrol'); // petrol, diesel, electric
    const [colorTheme, setColorTheme] = useState('#003CB3'); // Default blue
    const [storageIntegrationEnabled, setStorageIntegrationEnabled] = useState(true);
    const [batteryThreshold, setBatteryThreshold] = useState(30);

    const [apiLimits, setApiLimits] = useState({
        places: 50,
        directions: 50,
        geocode: 50
    });

    const [apiUsage, setApiUsage] = useState({
        places: { count: 0, date: new Date().toDateString() },
        directions: { count: 0, date: new Date().toDateString() },
        geocode: { count: 0, date: new Date().toDateString() }
    });

    const [lifetimeUsage, setLifetimeUsage] = useState({
        places: 0,
        directions: 0,
        geocode: 0
    });

    useEffect(() => {
        const loadSettingsData = async () => {
            try {
                const limitsStr = await AsyncStorage.getItem('apiLimits');
                if (limitsStr) setApiLimits(JSON.parse(limitsStr));

                const usageStr = await AsyncStorage.getItem('apiUsage');
                if (usageStr) {
                    const parsed = JSON.parse(usageStr);
                    const today = new Date().toDateString();
                    let needsUpdate = false;
                    for (const key in parsed) {
                        if (parsed[key].date !== today) {
                            parsed[key] = { count: 0, date: today };
                            needsUpdate = true;
                        }
                    }
                    setApiUsage(parsed);
                    if (needsUpdate) {
                        await AsyncStorage.setItem('apiUsage', JSON.stringify(parsed));
                    }
                }

                const lifetimeStr = await AsyncStorage.getItem('lifetimeUsage');
                if (lifetimeStr) {
                    const parsed = JSON.parse(lifetimeStr);
                    if (typeof parsed === 'object') {
                        setLifetimeUsage(parsed);
                    } else if (typeof parsed === 'number') {
                        // Migration from old numeric format
                        setLifetimeUsage({
                            places: 0,
                            directions: 0,
                            geocode: 0,
                            total_legacy: parsed
                        });
                    }
                }

            } catch (e) {
                console.error('Error loading settings data', e);
            }
        };
        loadSettingsData();
    }, []);

    const updateApiLimit = async (apiName, newLimit) => {
        const snappedLimit = Math.round(newLimit / 10) * 10;
        setApiLimits(prev => {
            const next = { ...prev, [apiName]: snappedLimit };
            AsyncStorage.setItem('apiLimits', JSON.stringify(next)).catch(e => console.error(e));
            return next;
        });
    };

    const incrementApiUsage = async (apiName) => {
        const today = new Date().toDateString();

        // Lifetime count for specific API
        setLifetimeUsage(prev => {
            const next = { ...prev, [apiName]: (prev[apiName] || 0) + 1 };
            AsyncStorage.setItem('lifetimeUsage', JSON.stringify(next)).catch(e => console.error(e));
            return next;
        });

        // Daily count
        setApiUsage(prev => {
            const currentData = prev[apiName] && prev[apiName].date === today ? prev[apiName] : { count: 0, date: today };
            const newData = { ...prev, [apiName]: { count: currentData.count + 1, date: today } };

            // Check other APIs for date reset as well
            for (const key in newData) {
                if (newData[key].date !== today) {
                    newData[key] = { count: 0, date: today };
                }
            }

            AsyncStorage.setItem('apiUsage', JSON.stringify(newData)).catch(e => console.error(e));
            return newData;
        });
    };

    const checkApiLimit = (apiName) => {
        const today = new Date().toDateString();
        const currentData = apiUsage[apiName] && apiUsage[apiName].date === today ? apiUsage[apiName] : { count: 0, date: today };
        const limit = apiLimits[apiName] || 250;
        return currentData.count < limit;
    };

    const toggleDarkMode = () => setIsDarkMode((prev) => !prev);
    const toggleNotifications = () => setNotificationsEnabled((prev) => !prev);
    const toggleStorageIntegration = () => setStorageIntegrationEnabled((prev) => !prev);

    return (
        <SettingsContext.Provider
            value={{
                isDarkMode,
                toggleDarkMode,
                notificationsEnabled,
                toggleNotifications,
                engineType,
                setEngineType,
                colorTheme,
                setColorTheme,
                storageIntegrationEnabled,
                toggleStorageIntegration,
                batteryThreshold,
                setBatteryThreshold,
                apiLimits,
                updateApiLimit,
                apiUsage,
                incrementApiUsage,
                checkApiLimit,
                lifetimeUsage
            }}
        >
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
