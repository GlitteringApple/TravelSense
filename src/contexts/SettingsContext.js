import React, { createContext, useContext, useState } from 'react';

const SettingsContext = createContext(undefined);

export const SettingsProvider = ({ children }) => {
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [engineType, setEngineType] = useState('petrol'); // petrol, diesel, electric
    const [colorTheme, setColorTheme] = useState('#003CB3'); // Default blue

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
