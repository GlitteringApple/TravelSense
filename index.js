import { registerRootComponent } from 'expo';
import App from './App';
import { SettingsProvider } from './src/contexts/SettingsContext';

const Root = () => (
    <SettingsProvider>
        <App />
    </SettingsProvider>
);

registerRootComponent(Root);
