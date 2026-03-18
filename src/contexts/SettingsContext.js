import React, { createContext, useContext, useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

const SettingsContext = createContext(undefined);

const POTHOLES_FILE = FileSystem.documentDirectory + 'potholes.json';

export const SettingsProvider = ({ children }) => {
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [engineType, setEngineType] = useState('petrol');
    const [colorTheme, setColorTheme] = useState('#003CB3');
    const [globalPotholes, setGlobalPotholes] = useState([]);

    // Load persisted potholes on startup
    useEffect(() => {
        (async () => {
            try {
                const json = await FileSystem.readAsStringAsync(POTHOLES_FILE);
                setGlobalPotholes(JSON.parse(json));
            } catch (e) {
                // File doesn't exist yet — that's fine on first launch
            }
        })();
    }, []);

    // Save to both state and disk
    const savePotholes = async (data) => {
        setGlobalPotholes(data);
        try {
            await FileSystem.writeAsStringAsync(POTHOLES_FILE, JSON.stringify(data, null, 2));
        } catch (e) {
            console.warn('Could not save potholes to disk:', e.message);
        }
    };

    const toggleDarkMode = () => setIsDarkMode((prev) => !prev);
    const toggleNotifications = () => setNotificationsEnabled((prev) => !prev);

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
                globalPotholes,
                setGlobalPotholes,
                savePotholes,
                potholeFilePath: POTHOLES_FILE,
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
