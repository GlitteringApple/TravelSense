import {
  View,
  Text,
  Modal,
  Image,
  ImageBackground,
  ScrollView,
  FlatList,
  Button,
  TextInput,
  StyleSheet,
  Pressable,
  StatusBar,
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  BackHandler,
  Switch,
  NativeModules,
  DeviceEventEmitter,
  AppState,
  Linking
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { File, Paths } from 'expo-file-system';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ButtonRound from "./components/ButtonRound"
import GraphCard from './components/GraphCard';
import { useSensorData } from './src/sensors/Sensor';
const mapImg = require("./assets/carte-geographique-du-monde.jpg");
import {
  NavigationContainer,
  createStaticNavigation,
  useNavigation,
  createNavigationContainerRef
} from '@react-navigation/native';
const navigationRef = createNavigationContainerRef();
import { createBottomTabNavigator, useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import * as Location from 'expo-location';
import { useEffect, useRef, useState, useMemo, createContext, useContext } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  SlideInDown,
  SlideOutDown,
  SlideInRight,
  SlideOutLeft,
  SlideInLeft,
  SlideOutRight,
  SlideInUp,
  SlideOutUp,
} from 'react-native-reanimated';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItem,
} from '@react-navigation/drawer';
import Svg, { Polygon } from 'react-native-svg';
import * as Progress from 'react-native-progress';
import MapView, { PROVIDER_GOOGLE, Marker, Callout, Polyline } from 'react-native-maps';
import { Accelerometer, Gyroscope } from "expo-sensors";
import {
  Canvas,
  Path,
  Skia,
  Group,
  useDerivedValue,
} from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { SettingsProvider, useSettings } from './src/contexts/SettingsContext';
import * as Battery from 'expo-battery';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const RecordingContext = createContext({
  isPaused: false,
  setIsPaused: () => { },
  elapsedTime: 0,
  setElapsedTime: () => { },
});

//Icons
import Entypo from '@expo/vector-icons/Entypo';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AntDesign from '@expo/vector-icons/AntDesign';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import * as DocumentPicker from 'expo-document-picker';

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

/* ------------------ Utilities ------------------ */

// Decode Google's encoded polyline format into an array of {latitude, longitude}
function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

// Strip HTML tags from direction instructions
function stripHtml(html) {
  return html ? html.replace(/<[^>]*>/g, '') : '';
}

/* ------------------ Screens ------------------ */

const Stack = createNativeStackNavigator();

function DrawerStack() {
  return (
    <Stack.Navigator screenOptions={{
      animation: 'default', headerShown: true, headerBackButtonMenuEnabled: false
    }}>
      <Stack.Screen name="Home" options={{ headerShown: false, gestureEnabled: false }} component={Tabs} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="About Us" component={AboutUsScreen} />
    </Stack.Navigator>
  )
}

function HomeScreen() {
  //0 = fully collapsed, 1 = fully expanded
  const progress = useSharedValue(0);
  const maxSearchWidth = useSharedValue(0);
  const screenWidth = Dimensions.get('window').width;
  const [isSearchBarFocused, setSearchBarFocused] = useState(true);
  const inputRef = useRef(null);
  const mapRef = useRef(null);
  const { colorTheme, isDarkMode, checkApiLimit, incrementApiUsage } = useSettings();
  const themeColors = {
    background: isDarkMode ? '#121212' : '#f5f5f5',
    card: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : '#000000',
    textSecondary: isDarkMode ? '#aaaaaa' : '#666666',
    border: isDarkMode ? '#333333' : '#e0e0e0',
  };

  useEffect(() => {
    navigation.getParent()?.setOptions({
      tabBarStyle: isNavigating ? { display: 'none' } : {
        display: 'flex',
        backgroundColor: themeColors.card,
        borderTopColor: themeColors.border,
      }
    });
    return () => {
      navigation.getParent()?.setOptions({ tabBarStyle: { display: 'flex' } });
    };
  }, [isNavigating, navigation, isDarkMode, themeColors]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);

  // Routing Search state
  const [isRoutingMode, setIsRoutingMode] = useState(false);
  const [startSearchQuery, setStartSearchQuery] = useState('Your location');
  const [startPlace, setStartPlace] = useState({
    id: 'your_location',
    displayName: { text: 'Your location' },
    formattedAddress: 'Current location',
    location: null
  });
  const [activeSearchField, setActiveSearchField] = useState('dest'); // 'start' or 'dest'
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Directions & Navigation state
  const [routes, setRoutes] = useState([]);           // Array of decoded route objects
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [showRoutes, setShowRoutes] = useState(false); // Directions mode
  const [isNavigating, setIsNavigating] = useState(false); // Driving/nav mode
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isFetchingRoutes, setIsFetchingRoutes] = useState(false);
  const userLocationRef = useRef(null);
  
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isFollowingUser, setIsFollowingUser] = useState(true);

  // Focus Refs
  const startInputRef = useRef(null);
  const destInputRef = useRef(null);

  // Place details state
  const [placeDetails, setPlaceDetails] = useState(null); // { rating, travelTime, travelDistance }

  // Animation states for the cards
  const [detailsEnterAnim, setDetailsEnterAnim] = useState(() => SlideInDown.duration(400));
  const [detailsExitAnim, setDetailsExitAnim] = useState(() => SlideOutDown.duration(400));

  const [topBarHeight, setTopBarHeight] = useState(0);
  const [initialRegion, setInitialRegion] = useState(null);

  // Load last saved location as initial region, then update it as user moves
  useEffect(() => {
    (async () => {
      try {
        // Immediately restore last known position
        const saved = await AsyncStorage.getItem('lastLocation');
        if (saved) {
          const { latitude, longitude } = JSON.parse(saved);
          setInitialRegion({ latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 });
        }
        // Then get current position and save it
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        userLocationRef.current = coords; // Ensure ref is set immediately
        await AsyncStorage.setItem('lastLocation', JSON.stringify(coords));
        
        // Always fly to current location on startup for a better experience
        mapRef.current?.animateToRegion({
          ...coords,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 1000);

        if (!saved) {
          setInitialRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 });
        }
      } catch (e) {
        console.warn('Could not load/save startup location:', e);
      }
    })();

    // Continuously save location in background
    let sub;
    (async () => {
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 100 },
        async (loc) => {
          try {
            await AsyncStorage.setItem('lastLocation', JSON.stringify({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            }));
          } catch (e) { }
        }
      );
    })();
    return () => { if (sub) sub.remove(); };
  }, []);

  const onLayout = (event) => {
    maxSearchWidth.value = event.nativeEvent.layout.width;
    setTopBarHeight(event.nativeEvent.layout.height);
  };

  const toggleInput = () => {
    //If not read-only, focus the text field.
    if (!isSearchBarFocused) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100)
    }
    else {
      inputRef.current?.blur();
    }
  };

  useEffect(() => {
    const keybDidShow = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const keybHidden = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
      // Only collapse if there are no search results showing AND no place is selected AND no text is entered
      if (searchResults.length === 0 && !selectedPlace && searchQuery.trim().length === 0) {
        if (!isSearchBarFocused) {
          toggleSearch();
        }
      }
    });

    return () => {
      keybDidShow.remove();
      keybHidden.remove();
    };
  }, [isSearchBarFocused, searchResults, selectedPlace, searchQuery]);

  //Smoothly animates expansion and collapse from 0 to 1.
  const toggleSearch = () => {
    setSearchBarFocused(!isSearchBarFocused);
    if (isSearchBarFocused) {
      progress.value = withTiming(1, {
        duration: 300,
      });
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100)
    }
    else {
      if (!isSearchBarFocused) {
        inputRef.current?.blur();
        progress.value = withTiming(0, {
          duration: 300,
        });
        // Clear search state when collapsing
        setSearchResults([]);
        setSearchQuery('');
        setSelectedPlace(null);
        setRoutes([]);
        setShowRoutes(false);
        setIsNavigating(false);
        setIsRoutingMode(false);
        setStartSearchQuery('Your location');
        setStartPlace({
          id: 'your_location',
          displayName: { text: 'Your location' },
          formattedAddress: 'Current location',
          location: null
        });
        setActiveSearchField('dest');
      }
    }
  };

  // Clear current search state
  const clearSearch = () => {
    setDetailsExitAnim(SlideOutDown.duration(400));
    const shouldCollapse = searchQuery.trim().length === 0 && (startSearchQuery.trim().length === 0 || startSearchQuery === 'Your location');
    
    setTimeout(() => {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedPlace(null);
      setRoutes([]);
      setShowRoutes(false);
      setIsNavigating(false);
      setIsRoutingMode(false);
      setStartSearchQuery('Your location');
      setStartPlace({
        id: 'your_location',
        displayName: { text: 'Your location' },
        formattedAddress: 'Current location',
        location: null
      });
      setActiveSearchField('dest');
      Keyboard.dismiss();

      if (shouldCollapse) {
        setSearchBarFocused(false);
        progress.value = withTiming(0, { duration: 300 });
      }
    }, 0);
  };

  // Intercept back button to close cards instead of exiting the app
  useEffect(() => {
    const onBackPress = () => {
      if (isNavigating) {
        // Since we are exiting from navigation mode back to the route panel (or clear it all),
        // we'll follow exitNavigation logic. exitNavigation clears BOTH isNavigating and showRoutes
        // so it goes back to the place details card natively right now.
        exitNavigation();
        return true;
      }
      if (showRoutes) {
        // Just go back to the single place details card
        setDetailsEnterAnim(SlideInLeft.duration(400));
        setShowRoutes(false);
        setIsRoutingMode(false);
        return true;
      }
      if (selectedPlace) {
        // Go from details card to an empty map
        clearSearch();
        return true;
      }
      return false; // Otherwise let it bubble up (e.g. to the app exit modal)
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [isNavigating, showRoutes, selectedPlace]);

  // Search places using Google Places API (New) - only on Enter
  const searchPlaces = async (query, field = activeSearchField) => {
    if (!query || query.trim().length === 0) return;
    if (!GOOGLE_PLACES_API_KEY) {
      Alert.alert('Missing API Key', 'EXPO_PUBLIC_GOOGLE_PLACES_API_KEY is not set in your .env file.');
      return;
    }

    if (!checkApiLimit('places')) {
      Alert.alert('API Limit Reached', 'You have reached the daily limit for the Places API.');
      return;
    }

    setIsSearching(true);
    setRoutes([]);
    setShowRoutes(false);
    setIsNavigating(false);
    try {
      await incrementApiUsage('places');
      let locationBias = {};
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        locationBias = {
          circle: {
            center: { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
            radius: 5000.0, // 5km radius bias
          },
        };
      } catch (e) {
        console.warn('Could not get location for search bias:', e);
      }

      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.id',
        },
        body: JSON.stringify({
          textQuery: query.trim(),
          ...(locationBias.circle && { locationBias }),
        }),
      });

      const data = await response.json();
      if (data.places && data.places.length > 0) {
        setSearchResults(data.places.slice(0, 5)); // Limit to 5 results
      } else {
        setSearchResults([]);
        Alert.alert('No Results', 'No places found for your search.');
      }
    } catch (error) {
      console.error('Places search error:', error);
      Alert.alert('Search Error', error.message || 'Failed to search places.');
    } finally {
      setIsSearching(false);
    }
  };

  // Select a place from the dropdown or map
  const selectPlace = (place) => {
    const { latitude, longitude } = place.location;
    setSearchResults([]);
    Keyboard.dismiss();

    let updatedStart = startPlace;
    let updatedDest = selectedPlace;

    if (activeSearchField === 'start') {
      updatedStart = place;
      setStartPlace(place);
      setStartSearchQuery(place.displayName?.text || '');
    } else {
      updatedDest = place;
      setSelectedPlace(place);
      setSearchQuery(place.displayName?.text || '');
      setDetailsEnterAnim(SlideInDown.duration(400));
      setDetailsExitAnim(SlideOutDown.duration(400));
      setPlaceDetails({ loading: true }); // show placeholders while fetching
      fetchPlaceDetails(place);
    }

    // Move cursor to end to show the end of the name/address, but actually we will do this onFocus.

    // Ensure search bar is open to show the selected name
    setSearchBarFocused(true);
    progress.value = withTiming(1, { duration: 300 });

    // Animate map to the selected place
    mapRef.current?.animateToRegion(
      {
        latitude,
        longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      800
    );

    if (activeSearchField === 'start') {
      if (updatedDest) {
        fetchDirections(false, updatedStart, updatedDest);
      }
    } else {
      if (isRoutingMode && updatedStart) {
        fetchDirections(false, updatedStart, updatedDest);
      }
    }
  };

  // Fetch rating from Places API and ETA from Directions API
  const fetchPlaceDetails = async (place) => {
    if (!GOOGLE_PLACES_API_KEY) return;
    let rating = null;
    let travelTime = null;
    let travelDistance = null;

    if (!checkApiLimit('places')) {
       Alert.alert('API Limit Reached', 'You have reached the daily limit for the Places API.');
       return;
    }

    // Fetch rating if place has a Places ID
    if (place.id && !place.id.startsWith('pin-')) {
      try {
        await incrementApiUsage('places');
        const res = await fetch(`https://places.googleapis.com/v1/places/${place.id}`, {
          headers: {
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
            'X-Goog-FieldMask': 'rating,userRatingCount',
          },
        });
        const data = await res.json();
        if (data.rating) rating = data.rating;
      } catch (e) { /* silent fail */ }
    }

    if (!checkApiLimit('directions')) {
      Alert.alert('API Limit Reached', 'You have reached the daily limit for the Directions API.');
      return;
    }
    // Fetch quick ETA from Directions API
    try {
      await incrementApiUsage('directions');
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const origin = `${loc.coords.latitude},${loc.coords.longitude}`;
      const dest = `${place.location.latitude},${place.location.longitude}`;
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${dest}&key=${GOOGLE_PLACES_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK' && data.routes.length > 0) {
        const leg = data.routes[0].legs[0];
        travelTime = leg.duration.text;
        travelDistance = leg.distance.text;
      }
    } catch (e) { /* silent fail */ }

    setPlaceDetails({ rating, travelTime, travelDistance });
  };

  // Handle generic tap on the map to drop a pin
  const handleMapPress = async (event) => {
    if (isNavigating) return;
    // Prevent accidental presses on existing markers/polylines from clearing state
    if (event.nativeEvent.action === 'marker-press' || event.nativeEvent.action === 'polyline-press') return;

    const { latitude, longitude } = event.nativeEvent.coordinate;
    if (activeSearchField === 'start') {
      setStartPlace(null);
      setStartSearchQuery('Fetching address...');
    } else {
      setSelectedPlace(null);
      setSearchQuery('Fetching address...');
      setDetailsExitAnim(SlideOutDown.duration(400));
    }

    setRoutes([]);
    setShowRoutes(false);

    if (!checkApiLimit('geocode')) {
      Alert.alert('API Limit Reached', 'You have reached the daily limit for the Geocoding API.');
      return;
    }

    try {
      await incrementApiUsage('geocode');
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_PLACES_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.results.length > 0) {
        const result = data.results[0];
        const readableName = result.formatted_address.split(',')[0];
        const newPlace = {
          id: result.place_id,
          displayName: { text: readableName === 'Unnamed Road' ? 'Dropped Pin' : readableName },
          formattedAddress: result.formatted_address,
          location: { latitude, longitude }
        };
        selectPlace(newPlace);
      } else {
        // Fallback if reverse geocode fails
        const fallback = {
          id: `pin-${Date.now()}`,
          displayName: { text: 'Dropped Pin' },
          formattedAddress: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          location: { latitude, longitude }
        };
        selectPlace(fallback);
      }
    } catch (error) {
      console.error('Reverse geocode error:', error);
    }
  };

  // Handle direct clicks on map labeled POIs
  const handlePoiClick = (event) => {
    if (isNavigating) return;
    const { placeId, name, coordinate } = event.nativeEvent;
    const newPlace = {
      id: placeId,
      displayName: { text: name },
      formattedAddress: name,
      location: coordinate
    };
    selectPlace(newPlace);
  };

  // Initialize navigation mode (prepare directions UI)
  const startNavigationMode = () => {
    Keyboard.dismiss();

    // Populate the inputs based on existing selected state
    // Always use the last selected startPlace if it exists
    if (!startPlace) {
      const defaultStart = {
        id: 'your_location',
        displayName: { text: 'Your location' },
        formattedAddress: 'Current location',
        location: null
      };
      setStartPlace(defaultStart);
      setStartSearchQuery('Your location');
    } else {
      // Use exactly what was last selected
      setStartSearchQuery(startPlace.displayName?.text || '');
    }

    if (selectedPlace) {
      setSearchQuery(selectedPlace.displayName?.text || '');
    }

    setIsFetchingRoutes(true);
    setIsRoutingMode(true);
    setRoutes([]); // Clear old routes immediately
    setShowRoutes(false); // Hide the panel while fetching
    
    // If we are in routing mode, we want any currently visible details card to exit downwards
    // and skip standard exit animations to go straight to route panel.
    setDetailsExitAnim(SlideOutDown.duration(400));

    // Wait for state to settle then fetch
    setTimeout(() => {
      fetchDirections();
    }, 100);
  };

  // Fetch directions with alternative routes from Google Directions API
  const fetchDirections = async (skipShow = false, overrideStart = null, overrideDest = null) => {
    const shouldSkipUI = skipShow === true;
    const currentStart = overrideStart || startPlace;
    const currentDest = overrideDest || selectedPlace;

    if (!shouldSkipUI) {
      setDetailsExitAnim(SlideOutLeft.duration(400));
    }

    if (!currentDest) return;
    if (!GOOGLE_PLACES_API_KEY) {
      Alert.alert('Missing API Key', 'EXPO_PUBLIC_GOOGLE_PLACES_API_KEY is not set in your .env file.');
      return;
    }

    setIsFetchingRoutes(true);
    setIsRoutingMode(true);
    setRoutes([]); // Clear old routes immediately
    setShowRoutes(false); // Hide the panel while fetching
    
    // If we are in routing mode, we want any currently visible details card to exit downwards
    // and skip standard exit animations to go straight to route panel.
    setDetailsExitAnim(SlideOutDown.duration(400));

    if (!checkApiLimit('directions')) {
      Alert.alert('API Limit Reached', 'You have reached the daily limit for the Directions API.');
      setIsFetchingRoutes(false);
      return [];
    }

    try {
      await incrementApiUsage('directions');
      // Get origin coordinates
      let originLat, originLng;
      if (!currentStart || currentStart.id === 'your_location') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        userLocationRef.current = loc.coords;
        originLat = loc.coords.latitude;
        originLng = loc.coords.longitude;
      } else {
        originLat = currentStart.location.latitude;
        originLng = currentStart.location.longitude;
      }
      const origin = `${originLat},${originLng}`;
      const dest = `${currentDest.location.latitude},${currentDest.location.longitude}`;

      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${dest}&alternatives=true&key=${GOOGLE_PLACES_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.routes && data.routes.length > 0) {
        const parsedRoutes = data.routes.map((route, idx) => {
          const leg = route.legs[0];
          const polylinePoints = decodePolyline(route.overview_polyline.points);
          return {
            index: idx,
            points: polylinePoints,
            summary: route.summary,
            distance: leg.distance.text,
            duration: leg.duration.text,
            durationValue: leg.duration.value,
            steps: leg.steps.map((step) => ({
              instruction: stripHtml(step.html_instructions),
              distance: step.distance.text,
              duration: step.duration.text,
              startLocation: step.start_location,
              endLocation: step.end_location,
              polyline: decodePolyline(step.polyline.points),
            })),
          };
        });

        setRoutes(parsedRoutes);
        setSelectedRouteIndex(0);

        if (!shouldSkipUI) {
          setShowRoutes(true);
          // Fit map to show full route
          const allPoints = parsedRoutes[0].points;
          if (allPoints.length > 0) {
            mapRef.current?.fitToCoordinates(allPoints, {
              edgePadding: { top: 120, right: 60, bottom: 250, left: 60 },
              animated: true,
            });
          }
        }
        return parsedRoutes;
      } else {
        setRoutes([]);
        setShowRoutes(false);
        Alert.alert('No Routes', data.status === 'ZERO_RESULTS'
          ? 'No driving routes found to this destination.'
          : `Directions API error: ${data.status}`);
        return [];
      }
    } catch (error) {
      console.error('Directions fetch error:', error);
      Alert.alert('Directions Error', error.message || 'Failed to fetch directions.');
      return [];
    } finally {
      setIsFetchingRoutes(false);
    }
  };

  // Enter driving/navigation mode
  const startNavigation = async () => {
    let currentRoutes = routes;
    const wasInOverview = showRoutes;

    if (currentRoutes.length === 0) {
      // Fetch routes but skip the selection overview
      currentRoutes = await fetchDirections(true);
    }

    if (!currentRoutes || currentRoutes.length === 0) {
      return;
    }

    setDetailsExitAnim(SlideOutDown.duration(400));
    setDetailsExitAnim(SlideOutDown.duration(400));
    setIsNavigating(true);
    setCurrentStepIndex(0);
    setShowRoutes(false);

    // If starting navigation directly (e.g. from chip), default to fastest route (0).
    // If starting from overview, use the route the user manually selected.
    if (!wasInOverview) {
      setSelectedRouteIndex(0);
    }

    // Check if we need to start in Preview Mode
    let preview = false;
    let initialStartPoint = null;
    if (userLocationRef.current && currentRoutes.length > 0) {
      initialStartPoint = currentRoutes[0].points[0];
      if (initialStartPoint) {
        const dist = Math.sqrt(
          Math.pow(userLocationRef.current.latitude - initialStartPoint.latitude, 2) +
          Math.pow(userLocationRef.current.longitude - initialStartPoint.longitude, 2)
        );
        if (dist > 0.002) { // roughly over 200m away
          preview = true;
        }
      }
    }
    setIsPreviewMode(preview);
    setIsFollowingUser(!preview);

    // Tilt camera immediately
    if (preview && currentRoutes.length > 0 && currentRoutes[0].steps.length > 0) {
      const firstStepLoc = currentRoutes[0].steps[0].startLocation;
      mapRef.current?.animateCamera(
        {
          center: { latitude: firstStepLoc.lat, longitude: firstStepLoc.lng },
          pitch: 60,
          heading: 0,
          zoom: 17,
        },
        { duration: 1000 }
      );
    } else if (userLocationRef.current) {
      const { latitude, longitude, heading } = userLocationRef.current;
      mapRef.current?.animateCamera(
        {
          center: { latitude, longitude },
          pitch: 60,
          heading: heading || 0,
          zoom: 17,
        },
        { duration: 1000 }
      );
    }

    // Refresh high-accuracy location in the background without blocking the UI
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      .then(loc => {
        userLocationRef.current = loc.coords;
      })
      .catch(e => console.error('Location error for nav mode:', e));

  };

  // Track user location during navigation to update current step
  useEffect(() => {
    if (!isNavigating || routes.length === 0) return;

    const selectedRoute = routes[selectedRouteIndex];
    if (!selectedRoute) return;

    let locationSub;
    (async () => {
      locationSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        (loc) => {
          userLocationRef.current = loc.coords;
          const { latitude, longitude } = loc.coords;

          // Update camera to follow user with tilt, but only if they haven't panned away
          if (isFollowingUser) {
            mapRef.current?.animateCamera(
              {
                center: { latitude, longitude },
                pitch: 60,
                heading: loc.coords.heading || 0,
                zoom: 17,
              },
              { duration: 500 }
            );
          }

          // Find nearest upcoming step
          const steps = selectedRoute.steps;
          let closestIdx = currentStepIndex;
          let minDist = Infinity;
          for (let i = currentStepIndex; i < steps.length; i++) {
            const stepEnd = steps[i].endLocation;
            const dist = Math.sqrt(
              Math.pow(latitude - stepEnd.lat, 2) +
              Math.pow(longitude - stepEnd.lng, 2)
            );
            if (dist < minDist) {
              minDist = dist;
              closestIdx = i;
            }
          }
          // If very close to end of current step, advance
          if (closestIdx > currentStepIndex || minDist < 0.0003) {
            setCurrentStepIndex(Math.min(closestIdx, steps.length - 1));
          }
        }
      );
    })();

    return () => {
      if (locationSub) locationSub.remove();
    };
  }, [isNavigating, selectedRouteIndex, routes]);

  // Exit navigation / directions mode
  const exitNavigation = () => {
    setDetailsEnterAnim(SlideInDown.duration(400)); // Moves UP from below
    setDetailsExitAnim(SlideOutDown.duration(400));
    setIsNavigating(false);
    setShowRoutes(false);
    setIsRoutingMode(false);
    setIsPreviewMode(false);
    setIsFollowingUser(true);
    setRoutes([]);
    setCurrentStepIndex(0);

    if (!searchQuery.trim() && !startSearchQuery.trim()) {
      setSearchBarFocused(false);
      progress.value = withTiming(0, { duration: 300 });
    }

    // Reset camera to normal top-down view
    if (userLocationRef.current) {
      mapRef.current?.animateCamera(
        {
          center: {
            latitude: userLocationRef.current.latitude,
            longitude: userLocationRef.current.longitude,
          },
          pitch: 0,
          heading: 0,
          zoom: 15,
        },
        { duration: 800 }
      );
    }
  };

  // Route colors
  const ROUTE_COLORS = ['#003CB3', '#4285F4', '#34A853', '#FBBC04', '#EA4335'];

  //Resizes the input field container.
  const searchBarStyle = useAnimatedStyle(() => {
    return {
      width: interpolate(progress.value, [0, 1], [50, screenWidth - 140]),
      height: withTiming(isRoutingMode ? 108 : 50, { duration: 300 }),
    };
  });

  //Fades search bar text in, and search icon out.
  const inputStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(progress.value, [0, 0.4, 1], [0, 0, 1]),
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(progress.value, [0, 0.3], [1, 0]),
      transform: [
        {
          scale: interpolate(progress.value, [0, 1], [1, 0.9]),
        },
      ],
    };
  });

  const [barStyle, setBarStyle] = useState('light-content');
  const { globalPotholes } = useSettings();
  const [zoomLevel, setZoomLevel] = useState(0.01);
  const HIDE_THRESHOLD = 0.5; // If longitudeDelta > 0.5, hide all potholes

  const onRunFunction = (barStyle) => {
    setBarStyle(barStyle);
  };

  // Basic grid-based clustering
  const getClusteredPotholes = () => {
    if (!globalPotholes || globalPotholes.length === 0 || zoomLevel > HIDE_THRESHOLD) return [];

    // Dynamically adjust grid size based on zoom level. 
    // Closer zoom = smaller grid cells = more individual markers
    const gridSize = zoomLevel / 10;

    const clusters = {};

    globalPotholes.forEach((pothole) => {
      // Create a grid key by rounding coordinates
      const gridLat = Math.round(pothole.gps_latitude / gridSize) * gridSize;
      const gridLng = Math.round(pothole.gps_longitude / gridSize) * gridSize;
      const key = `${gridLat.toFixed(5)},${gridLng.toFixed(5)}`;

      if (!clusters[key]) {
        clusters[key] = {
          ...pothole,
          count: 1,
          maxSeverity: pothole.severity
        };
      } else {
        clusters[key].count += 1;
        // Keep the highest severity in the cluster
        if (pothole.severity > clusters[key].maxSeverity) {
          clusters[key].maxSeverity = pothole.severity;
          clusters[key].severity = pothole.severity;
        }
      }
    });

    return Object.values(clusters);
  };

  const clusteredPotholes = useMemo(() => getClusteredPotholes(), [globalPotholes, zoomLevel]);

  //Fullscreen component
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener('drawerClose', () => {
      onRunFunction('light-content');
    });
    return unsubscribe;
  }, [navigation]);

  // Get ETA
  const getEtaString = () => {
    if (!routes[selectedRouteIndex]) return '';
    const durationSeconds = routes[selectedRouteIndex].durationValue || 0;
    const arrivalDate = new Date(Date.now() + durationSeconds * 1000);
    return arrivalDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  return (
    <View style={styles.fullscreen}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        showsUserLocation={true}
        showsMyLocationButton={false}
        followsUserLocation={isNavigating}
        showsTraffic={showRoutes || isNavigating}
        showsCompass={isNavigating}
        onPress={handleMapPress}
        onPoiClick={handlePoiClick}
        initialRegion={initialRegion || undefined}
        onRegionChangeComplete={(region, details) => {
          setZoomLevel(region.longitudeDelta);
          if (isNavigating && details && details.isGesture) {
            setIsFollowingUser(false);
          }
        }}
      >
        {clusteredPotholes.map((pothole, index) => (
          <Marker
            key={index}
            coordinate={{ latitude: pothole.gps_latitude, longitude: pothole.gps_longitude }}
          />
        ))}
        {selectedPlace && (
          <Marker
            coordinate={{
              latitude: selectedPlace.location.latitude,
              longitude: selectedPlace.location.longitude,
            }}
            title={selectedPlace.displayName?.text}
            description={selectedPlace.formattedAddress}
            pinColor={colorTheme}
          />
        )}
        {isRoutingMode && startPlace && startPlace.id !== 'your_location' && startPlace.location && (
          <Marker
            coordinate={{
              latitude: startPlace.location.latitude,
              longitude: startPlace.location.longitude,
            }}
            title={startPlace.displayName?.text}
            description={startPlace.formattedAddress}
            pinColor="green"
          />
        )}
        {/* Route polylines – render with outline for contrast */}
        {(showRoutes || isNavigating) && routes.map((route, idx) => {
          const isSelected = idx === selectedRouteIndex;
          if (isNavigating && !isSelected) return null;

          // Render outline first
          return (
            <Polyline
              key={`route-outline-${idx}`}
              coordinates={route.points}
              strokeColor={isDarkMode ? "#000000" : "#424242"}
              strokeWidth={isSelected ? 10 : 7}
              lineCap="round"
              lineJoin="round"
              zIndex={isSelected ? 2 : 1}
            />
          );
        })}
        {(showRoutes || isNavigating) && routes.map((route, idx) => {
          const isSelected = idx === selectedRouteIndex;
          if (isNavigating && !isSelected) return null;

          const strokeColor = isSelected ? colorTheme : '#BDBDBD';
          return (
            <Polyline
              key={`route-main-${idx}`}
              coordinates={route.points}
              strokeColor={strokeColor}
              strokeWidth={isSelected ? 6 : 4}
              lineCap="round"
              lineJoin="round"
              tappable={!isSelected}
              onPress={() => setSelectedRouteIndex(idx)}
              zIndex={isSelected ? 4 : 3}
            />
          );
        })}
      </MapView>
      <StatusBar translucent backgroundColor="transparent" barStyle={barStyle} />

      {/* Navigation Instruction Card (top, during driving mode) */}
      {isNavigating && routes[selectedRouteIndex] && (
        <Animated.View
          entering={SlideInUp.duration(400)}
          exiting={SlideOutUp.duration(400)}
          style={[styles.navInstructionCard, { backgroundColor: colorTheme }]}
        >
          <View style={styles.navInstructionRow}>
            <View style={styles.navInstructionIconWrap}>
              <MaterialIcons name="directions" size={28} color="white" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.navInstructionText} numberOfLines={2}>
                {isPreviewMode ? 'Route preview' : (routes[selectedRouteIndex].steps[currentStepIndex]?.instruction || 'Proceed to route')}
              </Text>
              <Text style={styles.navInstructionSub}>
                {routes[selectedRouteIndex].steps[currentStepIndex]?.instruction || ''}
              </Text>
            </View>
          </View>
          <View style={[styles.navStepProgress, isPreviewMode && { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            {isPreviewMode && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  disabled={currentStepIndex === 0}
                  onPress={() => {
                    const nextIdx = Math.max(0, currentStepIndex - 1);
                    setCurrentStepIndex(nextIdx);
                    const stLoc = routes[selectedRouteIndex].steps[nextIdx].startLocation;
                    mapRef.current?.animateCamera({ center: { latitude: stLoc.lat, longitude: stLoc.lng }, pitch: 60, zoom: 17, heading: 0 }, { duration: 600 });
                  }}
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}
                >
                  <Text style={{ color: currentStepIndex === 0 ? 'rgba(255,255,255,0.4)' : 'white', fontWeight: 'bold' }}>Prev</Text>
                </Pressable>
                <Pressable
                  disabled={currentStepIndex >= routes[selectedRouteIndex].steps.length - 1}
                  onPress={() => {
                    const nextIdx = Math.min(routes[selectedRouteIndex].steps.length - 1, currentStepIndex + 1);
                    setCurrentStepIndex(nextIdx);
                    const stLoc = routes[selectedRouteIndex].steps[nextIdx].startLocation;
                    mapRef.current?.animateCamera({ center: { latitude: stLoc.lat, longitude: stLoc.lng }, pitch: 60, zoom: 17, heading: 0 }, { duration: 600 });
                  }}
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}
                >
                  <Text style={{ color: currentStepIndex >= routes[selectedRouteIndex].steps.length - 1 ? 'rgba(255,255,255,0.4)' : 'white', fontWeight: 'bold' }}>Next</Text>
                </Pressable>
              </View>
            )}
            <Text style={styles.navStepProgressText}>
              Step {currentStepIndex + 1} of {routes[selectedRouteIndex].steps.length}
            </Text>
          </View>
        </Animated.View>
      )}

      <View style={{ flex: 1 }} pointerEvents="box-none">
        {/* Top bar: hidden during navigation mode for cleaner driving view */}
        {!isNavigating && (
          <SafeAreaView style={styles.wrapper} onLayout={onLayout} pointerEvents="box-none">

            <ButtonRound onPress={() => {
              navigation.openDrawer();
              onRunFunction('dark-content');
            }} style={{ backgroundColor: themeColors.card }}>
              <Entypo name="menu" size={24} color={themeColors.text} />
            </ButtonRound>

            <View style={{ flex: 1 }}>
              <Pressable onPress={toggleSearch} style={{ flex: 0 }}>
                <Animated.View style={[styles.searchContainer, searchBarStyle, { backgroundColor: themeColors.card }]}>
                  <Animated.View style={[styles.iconWrapper, iconStyle]}>
                    <FontAwesome name="search" size={20} color={themeColors.text} />
                  </Animated.View>
                  <Animated.View style={[styles.inputWrapper, inputStyle, isRoutingMode && { flexDirection: 'column', paddingVertical: 8, gap: 8 }]}>
                    {isRoutingMode && (
                      <Animated.View entering={SlideInDown.duration(300)} exiting={SlideOutUp.duration(300)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TextInput
                          ref={startInputRef}
                          placeholder="Starting location..."
                          placeholderTextColor={themeColors.textSecondary}
                          style={[styles.input, { color: themeColors.text, paddingRight: 40, height: 42, elevation: 0 }]}
                          value={startSearchQuery}
                          onFocus={() => {
                            setActiveSearchField('start');
                            setTimeout(() => {
                              startInputRef.current?.setSelection(startSearchQuery.length, startSearchQuery.length);
                            }, 50);
                          }}
                          onBlur={() => {
                            startInputRef.current?.setSelection(0, 0);
                            if (!startSearchQuery.trim()) {
                              setStartSearchQuery(startPlace ? (startPlace.displayName?.text || 'Your location') : 'Your location');
                            }
                          }}
                          onChangeText={setStartSearchQuery}
                          onSubmitEditing={() => searchPlaces(startSearchQuery, 'start')}
                          returnKeyType="search"
                        />
                        <View style={[styles.searchRightIcons, { height: 42 }]}>
                          {isSearching && activeSearchField === 'start' ? (
                            <ActivityIndicator size="small" color={colorTheme} style={{ marginRight: 8 }} />
                          ) : (
                            startSearchQuery.length > 0 ? (
                              <Pressable onPress={() => { setStartSearchQuery(''); setStartPlace(null); }} style={{ padding: 8 }}>
                                <MaterialIcons name="close" size={20} color={themeColors.textSecondary} />
                              </Pressable>
                            ) : (
                              <Pressable
                                onPress={() => {
                                  const defaultStart = {
                                    id: 'your_location',
                                    displayName: { text: 'Your location' },
                                    formattedAddress: 'Current location',
                                    location: null
                                  };
                                  setStartSearchQuery('Your location');
                                  setStartPlace(defaultStart);
                                  if (selectedPlace) {
                                    fetchDirections(false, defaultStart, selectedPlace);
                                  }
                                }}
                                style={{ padding: 8 }}
                              >
                                <MaterialIcons name="my-location" size={20} color={colorTheme} />
                              </Pressable>
                            )
                          )}
                        </View>
                      </Animated.View>
                    )}

                    {isRoutingMode && (
                      <View style={{ height: 1, backgroundColor: themeColors.border, marginHorizontal: -10, opacity: 0.5 }} />
                    )}

                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: isRoutingMode ? 0 : 1 }}>
                      <TextInput
                        placeholder={isRoutingMode ? "Destination location..." : "Search TravelSense..."}
                        placeholderTextColor={themeColors.textSecondary}
                        style={[styles.input, { color: themeColors.text, paddingRight: 40, height: isRoutingMode ? 42 : 50, elevation: isRoutingMode ? 0 : 0 }]}
                        ref={destInputRef}
                        readOnly={isSearchBarFocused}
                        onFocus={() => {
                          setActiveSearchField('dest');
                          setTimeout(() => {
                            destInputRef.current?.setSelection(searchQuery.length, searchQuery.length);
                          }, 50);
                        }}
                        onBlur={() => {
                          destInputRef.current?.setSelection(0, 0);
                        }}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onSubmitEditing={() => searchPlaces(searchQuery, 'dest')}
                        returnKeyType="search"
                      />
                      <View style={[styles.searchRightIcons, { height: isRoutingMode ? 42 : 50 }]}>
                        {isSearching && activeSearchField === 'dest' ? (
                          <ActivityIndicator size="small" color={colorTheme} style={{ marginRight: 8 }} />
                        ) : (
                          searchQuery.length > 0 && (
                            <Pressable onPress={() => setSearchQuery('')} style={{ padding: 8 }}>
                              <MaterialIcons name="close" size={20} color={themeColors.textSecondary} />
                            </Pressable>
                          )
                        )}
                      </View>
                    </View>
                  </Animated.View>
                </Animated.View>
              </Pressable>
            </View>

            <ButtonRound onPress={async () => {
              try {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
                userLocationRef.current = coords;
                mapRef.current?.animateCamera({
                  center: coords,
                  zoom: 15,
                  pitch: 0,
                  heading: 0,
                }, { duration: 1000 });
              } catch (e) {
                console.warn('GPS center error:', e);
              }
            }} style={{ backgroundColor: themeColors.card }}>
              <MaterialIcons name="my-location" size={24} color={colorTheme} />
            </ButtonRound>

          </SafeAreaView>
        )}

        {/* Global Search Results Dropdown Overlay */}
        {!isNavigating && searchResults.length > 0 && (
          <View style={[
            styles.dropdown,
            {
              backgroundColor: themeColors.card,
              borderColor: themeColors.border,
              left: 10,
              top: topBarHeight + 0 // sit directly below search bar container
            }
          ]}>
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.dropdownItem, { borderBottomColor: themeColors.border }]}
                  onPress={() => selectPlace(item)}
                >
                  <View style={[styles.dropdownIcon, { backgroundColor: isDarkMode ? '#333' : '#EEF2FF' }]}>
                    <Entypo name="location-pin" size={20} color={colorTheme} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dropdownTitle, { color: themeColors.text }]}>
                      {item.displayName?.text || 'Unknown'}
                    </Text>
                    <Text style={[styles.dropdownSubtitle, { color: themeColors.textSecondary }]}>
                      {item.formattedAddress || ''}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          </View>
        )}

        {/* Place Details Card (bottom, when place selected) */}
        {selectedPlace && !isRoutingMode && !showRoutes && !isNavigating && !isKeyboardVisible && searchResults.length === 0 && (
          <Animated.View
            key={`details-${selectedPlace.id}`}
            entering={detailsEnterAnim}
            exiting={searchResults.length > 0 ? SlideOutDown.duration(400) : detailsExitAnim}
            style={[styles.detailsCard, { backgroundColor: themeColors.card }]}
          >
            {/* Header + Close */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.detailsTitle, { color: themeColors.text }]}>
                  {selectedPlace.displayName?.text}
                </Text>
                <Text style={[styles.detailsAddress, { color: themeColors.textSecondary }]}>
                  {selectedPlace.formattedAddress}
                </Text>
              </View>
              <Pressable 
                onPress={() => {
                  clearSearch();
                }} 
                style={{ padding: 4, marginTop: -4, marginRight: -4 }}
              >
                <MaterialIcons name="close" size={24} color={themeColors.textSecondary} />
              </Pressable>
            </View>

            {/* Rating + ETA chips */}
            {placeDetails && (
              <View style={styles.detailsMeta}>
                {(placeDetails.rating || placeDetails.loading) && (
                  <View style={[styles.detailsChip, { borderColor: '#FFC107', backgroundColor: isDarkMode ? '#2a2000' : '#FFFBEA' }]}>
                    <MaterialIcons name="star" size={15} color="#FFC107" />
                    <Text style={[styles.detailsChipText, { color: '#B8860B' }]}>
                      {placeDetails.rating ? placeDetails.rating.toFixed(1) : '-'}
                    </Text>
                  </View>
                )}
                {(placeDetails.travelTime || placeDetails.loading) && (
                  <View style={[styles.detailsChip, { borderColor: colorTheme, backgroundColor: isDarkMode ? '#0d1a33' : '#EEF2FF' }]}>
                    <MaterialIcons name="schedule" size={15} color={colorTheme} />
                    <Text style={[styles.detailsChipText, { color: colorTheme }]}>
                      {placeDetails.travelTime || '-'}
                    </Text>
                  </View>
                )}
                {(placeDetails.travelDistance || placeDetails.loading) && (
                  <View style={[styles.detailsChip, { borderColor: themeColors.border, backgroundColor: isDarkMode ? '#252525' : '#F5F5F5' }]}>
                    <MaterialIcons name="straighten" size={15} color={themeColors.textSecondary} />
                    <Text style={[styles.detailsChipText, { color: themeColors.textSecondary }]}>
                      {placeDetails.travelDistance || '-'}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.navChipsRow}>
              <Pressable
                style={[
                  styles.routeOption,
                  {
                    flex: 1,
                    marginRight: 8,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 16,
                    backgroundColor: isDarkMode ? '#2c2c2c' : '#F5F5F5',
                    borderColor: colorTheme,
                  },
                ]}
                onPress={() => {
                  startNavigationMode();
                }}
                disabled={isFetchingRoutes}
              >
                {isFetchingRoutes
                  ? <ActivityIndicator size="small" color={colorTheme} />
                  : <MaterialIcons name="directions" size={22} color={colorTheme} />
                }
                <Text style={[styles.routeOptionDuration, { color: colorTheme, fontSize: 16 }]}>Directions</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.routeOption,
                  {
                    flex: 1,
                    marginRight: 0,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 16,
                    backgroundColor: colorTheme,
                    borderColor: colorTheme,
                  },
                ]}
                onPress={startNavigationMode}
              >
                <MaterialIcons name="navigation" size={22} color="white" />
                <Text style={[styles.routeOptionDuration, { color: 'white', fontSize: 16 }]}>Start</Text>
              </Pressable>
            </View>


          </Animated.View>
        )}
      </View>

      {/* Route Info Panel (bottom, during directions mode) */}
      {showRoutes && !isNavigating && routes.length > 0 && !isKeyboardVisible && searchResults.length === 0 && (
        <Animated.View
          key="route-panel"
          entering={SlideInDown.duration(400)}
          exiting={searchResults.length > 0 ? SlideOutDown.duration(400) : SlideOutRight.duration(400)}
          style={[styles.routePanel, { backgroundColor: themeColors.card }]}
        >
          <View style={styles.routePanelHeader}>
            <Text style={[styles.routePanelTitle, { color: themeColors.text }]}>
              {selectedPlace?.displayName?.text || 'Destination'}
            </Text>
            <Pressable onPress={exitNavigation} style={styles.routePanelClose}>
              <MaterialIcons name="arrow-back" size={22} color={themeColors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {routes.map((route, idx) => (
              <Pressable
                key={idx}
                style={[
                  styles.routeOption,
                  { backgroundColor: isDarkMode ? '#2c2c2c' : '#F5F5F5' },
                  idx === selectedRouteIndex && { borderColor: colorTheme, backgroundColor: isDarkMode ? '#1a237e' : '#EEF2FF' },
                ]}
                onPress={() => {
                  setSelectedRouteIndex(idx);
                  mapRef.current?.fitToCoordinates(route.points, {
                    edgePadding: { top: 120, right: 60, bottom: 250, left: 60 },
                    animated: true,
                  });
                }}
              >
                <Text style={[
                  styles.routeOptionDuration,
                  { color: themeColors.text },
                  idx === selectedRouteIndex && { color: colorTheme },
                ]}>
                  {route.duration}
                </Text>
                <Text style={[styles.routeOptionDistance, { color: themeColors.textSecondary }]}>
                  {route.distance} · via {route.summary}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            style={[styles.startNavButton, { backgroundColor: colorTheme }]}
            onPress={() => {
              setDetailsExitAnim(SlideOutDown.duration(400));
              startNavigation();
            }}
          >
            <MaterialIcons name="navigation" size={20} color="white" />
            <Text style={styles.startNavButtonText}>
              {(() => {
                if (userLocationRef.current && routes[selectedRouteIndex]) {
                  const startPoint = routes[selectedRouteIndex].points[0];
                  if (startPoint) {
                    const dist = Math.sqrt(
                      Math.pow(userLocationRef.current.latitude - startPoint.latitude, 2) +
                      Math.pow(userLocationRef.current.longitude - startPoint.longitude, 2)
                    );
                    if (dist > 0.002) return 'Preview Route';
                  }
                }
                return 'Start Navigation';
              })()}
            </Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Exit button during navigation mode */}
      {isNavigating && (
        <Animated.View
          entering={SlideInDown.duration(400)}
          exiting={SlideOutDown.duration(400)}
          style={styles.navExitContainer}
        >
          <View style={[styles.navEtaBar, { backgroundColor: themeColors.card }]}>
            <View>
              <Text style={[styles.navEtaDuration, { color: themeColors.text }]}>{routes[selectedRouteIndex]?.duration || ''}</Text>
              <Text style={[styles.navEtaDistance, { color: themeColors.textSecondary }]}>{routes[selectedRouteIndex]?.distance || ''} • ETA {getEtaString()}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {!isFollowingUser && (
                <Pressable
                  style={[styles.navExitButton, { backgroundColor: '#4285F4', paddingHorizontal: 12 }]}
                  onPress={() => {
                    setIsFollowingUser(true);
                    if (userLocationRef.current) {
                      mapRef.current?.animateCamera({
                        center: { latitude: userLocationRef.current.latitude, longitude: userLocationRef.current.longitude },
                        pitch: 60, heading: userLocationRef.current.heading || 0, zoom: 17
                      }, { duration: 800 });
                    }
                  }}
                >
                  <MaterialIcons name="my-location" size={20} color="white" />
                </Pressable>
              )}
              <Pressable style={styles.navExitButton} onPress={exitNavigation}>
                <MaterialIcons name="close" size={20} color="white" />
                <Text style={styles.navExitText}>Exit</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

import SensorUpload from './src/sensors/SensorUpload';

/* ---------- Pothole Editor Modal ---------- */
function PotholeEditorModal({ visible, onClose, potholes, onSave }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setText(JSON.stringify(potholes, null, 2));
      setError('');
    }
  }, [visible]);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(text);
      onSave(parsed);
      onClose();
    } catch (e) {
      setError('Invalid JSON: ' + e.message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 48, borderBottomWidth: 1, borderBottomColor: '#333' }}>
          <Text style={{ flex: 1, color: '#e0e0e0', fontSize: 18, fontWeight: 'bold' }}>📋 Sensor Data Editor</Text>
          <Pressable onPress={onClose} style={{ padding: 8 }}>
            <MaterialIcons name="close" size={24} color="#e0e0e0" />
          </Pressable>
        </View>
        {/* File hint */}
        <Text style={{ color: '#888', fontSize: 11, paddingHorizontal: 16, paddingTop: 8 }}>
          Saved to: sensor_data.json (app documents folder)
        </Text>
        {/* Editor */}
        <ScrollView style={{ flex: 1, padding: 16 }} keyboardShouldPersistTaps="handled">
          <TextInput
            multiline
            value={text}
            onChangeText={setText}
            style={{ fontFamily: 'monospace', color: '#a8ff78', fontSize: 12, lineHeight: 18, backgroundColor: '#0a0a1a', padding: 12, borderRadius: 8, minHeight: 400 }}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
        </ScrollView>
        {/* Validation error */}
        {error ? <Text style={{ color: '#ff6b6b', paddingHorizontal: 16, paddingBottom: 4, fontSize: 12 }}>{error}</Text> : null}
        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 32 }}>
          <Pressable onPress={onClose} style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#333', alignItems: 'center' }}>
            <Text style={{ color: '#e0e0e0', fontWeight: 'bold' }}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleSave} style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#003CB3', alignItems: 'center' }}>
            <Text style={{ color: 'white', fontWeight: 'bold' }}>Save</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function DataScreen(props) {
  const { isPaused, setIsPaused, elapsedTime } = useContext(RecordingContext);
  const padding = 15;
  const tabBarHeight = useBottomTabBarHeight();
  const sensorState = useSensorData(isPaused);
  const { isDarkMode, colorTheme, globalPotholes, setGlobalPotholes, savePotholes } = useSettings();
  const [isUploading, setIsUploading] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const themeColors = {
    background: isDarkMode ? '#121212' : '#f5f5f5',
    card: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : '#000000',
  };

  const handleFlushData = async () => {
    setIsUploading(true);
    try {
      await SensorUpload.uploadData('traveler-1');
      Alert.alert('Success', 'Last 5 mins of sensor data flushed to database.');
    } catch (error) {
      Alert.alert('Upload Failed', error.message || 'Check your server connection');
    } finally {
      setIsUploading(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      const res = await SensorUpload.testConnection();
      Alert.alert('DB Connected!', `Server time: ${res.time}`);
    } catch (error) {
      Alert.alert('DB Error', error.message || 'Server check failed');
    }
  };

  const handleFetchPotholes = async () => {
    try {
      const data = await SensorUpload.fetchPotholes();
      await savePotholes(data);
      Alert.alert('Sync Complete', `Stored ${data.length} potholes locally.`);
    } catch (error) {
      Alert.alert('Sync Error', error.message);
    }
  };

  const handleTriggerProcessing = async () => {
    try {
      const result = await SensorUpload.triggerProcessing(0.5);
      Alert.alert('Processing Complete', `Found ${result.potholes_found} potholes from ${result.processed} records.`);
    } catch (error) {
      Alert.alert('Processing Error', error.message);
    }
  };

  const currentSpeed = Math.round(sensorState.data.gps.speed || 0);

  return (
    <>
      <View style={[styles.screen, { padding: padding, backgroundColor: themeColors.background }]}>
        <View style={{ backgroundColor: themeColors.card, borderRadius: 25, height: 150, overflow: 'hidden' }}>
          <View style={{ backgroundColor: isPaused ? '#ffae00' : 'lime', flexDirection: 'row' }}>
            <Text style={{ color: 'white', fontWeight: 'bold', left: 12.5, fontSize: 17.5 }}>STATUS: {isPaused ? 'PAUSED' : 'TRAVELLING'}</Text>
            <Svg height="23" width="100%" viewBox="0 0 20 2">
              <Polygon
                points="0,0 15,0 15,15 20,20"
                fill={isPaused ? 'orange' : 'green'}
              />
            </Svg>
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 17.5, position: "absolute", right: 25 }}>AUTO: {isPaused ? 'OFF' : 'ON'}</Text>
          </View>

          <View style={{ backgroundColor: themeColors.card, flex: 1, padding: padding }}>
            <View style={{ flexDirection: "row" }}>
              <Text style={{ color: themeColors.text, fontSize: 60, fontWeight: "bold", includeFontPadding: false, lineHeight: 50 }}>{currentSpeed}</Text>
              <Text style={{ color: themeColors.text, textAlignVertical: "bottom", bottom: 0, marginLeft: 3 }}>km/h</Text>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", marginLeft: 5 }}>
                <View>
                  <Text style={{ color: themeColors.text }}>RECORDING: </Text>
                  <Text style={{ color: themeColors.text }}>{formatTime(elapsedTime)}</Text>
                </View>
                <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-evenly" }}>
                  <ButtonRound size={30} onPress={() => setIsPaused(!isPaused)}>
                    <FontAwesome5 name={isPaused ? "play" : "pause"} size={15} color={isDarkMode ? 'white' : 'black'} />
                  </ButtonRound>
                  <ButtonRound size={30} onPress={handleTestConnection}>
                    <MaterialIcons name="storage" size={15} color={isDarkMode ? 'white' : 'black'} />
                  </ButtonRound>
                  <ButtonRound size={30} onPress={handleFetchPotholes}>
                    <FontAwesome5 name="map-marker-alt" size={15} color={isDarkMode ? 'white' : 'black'} />
                  </ButtonRound>
                  <ButtonRound size={30} onPress={handleTriggerProcessing}>
                    <MaterialIcons name="analytics" size={15} color={isDarkMode ? 'white' : 'black'} />
                  </ButtonRound>
                  <ButtonRound size={30} onPress={() => setEditorVisible(true)}>
                    <Feather name="eye" size={15} color={isDarkMode ? 'white' : 'black'} />
                  </ButtonRound>
                  <ButtonRound size={30} onPress={handleFlushData} disabled={isUploading}>
                    {isUploading ? (
                      <ActivityIndicator size="small" color={isDarkMode ? 'white' : 'black'} />
                    ) : (
                      <FontAwesome5 name="upload" size={15} color={isDarkMode ? 'white' : 'black'} />
                    )}
                  </ButtonRound>
                </View>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", bottom: padding, left: padding, position: "absolute" }}>
              <Text style={{ color: themeColors.text, position: "relative" }}>CONFIDENCE:</Text>
              <Progress.Bar progress={1} animated={false} width={null} borderRadius={0} borderWidth={0} color={"red"} unfilledColor={"pink"} style={{ alignSelf: "center", flex: 1, marginLeft: 10 }} />
              <Progress.Bar progress={1} animated={false} width={null} borderRadius={0} borderWidth={0} color={"gold"} unfilledColor={"lightgoldenrodyellow"} style={{ alignSelf: "center", flex: 1 }} />
              <Progress.Bar progress={0.5} animated={false} width={null} borderRadius={0} borderWidth={0} color={"green"} unfilledColor={"lightgreen"} style={{ alignSelf: "center", flex: 1 }} />
            </View>
          </View>
        </View>
        <Text style={{ color: themeColors.text, fontWeight: "bold", fontSize: 20, padding: 10 }}>Sensors used: </Text>
        <ScrollView style={{ borderRadius: 25 }}>
          <GraphCard title="GPS: " sensor="gps" sensorState={sensorState} isDarkMode={isDarkMode} />
          <GraphCard title="Accl: " sensor="accelerometer" sensorState={sensorState} isDarkMode={isDarkMode} />
          <GraphCard title="Gyro: " sensor="gyroscope" sensorState={sensorState} isDarkMode={isDarkMode} />
          <GraphCard title="Baro: " sensor="barometer" sensorState={sensorState} isDarkMode={isDarkMode} />
          <GraphCard title="Mag:" sensor="magnetometer" sensorState={sensorState} isDarkMode={isDarkMode} />
        </ScrollView>
      </View>
      <PotholeEditorModal
        visible={editorVisible}
        onClose={() => setEditorVisible(false)}
        potholes={SensorUpload.dataBatch}
        onSave={(parsed) => {
          SensorUpload.dataBatch = parsed;
          SensorUpload.persistToDisk();
        }}
      />
    </>
  );
}

function TravelogueScreen() {
  const { isDarkMode } = useSettings();
  const themeColors = {
    background: isDarkMode ? '#121212' : '#f5f5f5',
    text: isDarkMode ? '#ffffff' : '#000000',
  };
  return (
    <View style={[styles.settingsScreen, { backgroundColor: themeColors.background }]}>
      <Text style={{ color: themeColors.text }}>This is the travelogue screen.</Text>
    </View>
  );
}

function SettingsScreen() {
  const {
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
    lifetimeUsage
  } = useSettings();

  const insets = useSafeAreaInsets();
  const themeColors = {
    background: isDarkMode ? '#121212' : '#f5f5f5',
    card: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : '#000000',
    textSecondary: isDarkMode ? '#aaaaaa' : '#666666',
    border: isDarkMode ? '#333333' : '#e0e0e0',
  };

  const renderEngineButton = (type, label) => (
    <Pressable
      style={[
        styles.engineButton,
        engineType === type && { backgroundColor: colorTheme, borderColor: colorTheme },
        { borderColor: themeColors.border }
      ]}
      onPress={() => setEngineType(type)}
    >
      <Text style={[styles.engineText, { color: engineType === type ? '#ffffff' : themeColors.text }]}>{label}</Text>
    </Pressable>
  );

  const colors = ['#003CB3', '#D32F2F', '#388E3C', '#FBC02D', '#7B1FA2'];

  return (
    <ScrollView style={[styles.settingsScreen, { backgroundColor: themeColors.background }]}>
      <View style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 20 }}>
        <Text style={[styles.headerText, { color: themeColors.text }]}>Settings</Text>

        <View style={[styles.settingsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.settingRow}>
            <View>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Dark Mode</Text>
              <Text style={[styles.settingDesc, { color: themeColors.textSecondary }]}>Toggle application theme</Text>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={toggleDarkMode}
              trackColor={{ false: '#767577', true: colorTheme }}
              thumbColor={'#ffffff'}
            />
          </View>

          <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: themeColors.border }]}>
            <View>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Notifications</Text>
              <Text style={[styles.settingDesc, { color: themeColors.textSecondary }]}>Enable push notifications</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: '#767577', true: colorTheme }}
              thumbColor={'#ffffff'}
            />
          </View>

          <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: themeColors.border }]}>
            <View>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Storage Integration</Text>
              <Text style={[styles.settingDesc, { color: themeColors.textSecondary }]}>Show app files in system Files app</Text>
            </View>
            <Switch
              value={storageIntegrationEnabled}
              onValueChange={toggleStorageIntegration}
              trackColor={{ false: '#767577', true: colorTheme }}
              thumbColor={'#ffffff'}
            />
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>VEHICLE</Text>
        <View style={[styles.settingsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border, paddingVertical: 15 }]}>
          <View style={{ paddingHorizontal: 15, paddingBottom: 15 }}>
            <Text style={[styles.settingTitle, { color: themeColors.text }]}>Battery Threshold</Text>
            <Text style={[styles.settingDesc, { color: themeColors.textSecondary, marginBottom: 10 }]}>Auto-pause recording below {batteryThreshold}%</Text>
            <Slider
              style={{ width: '100%', height: 40 }}
              minimumValue={15}
              maximumValue={100}
              step={1}
              value={batteryThreshold}
              onValueChange={setBatteryThreshold}
              minimumTrackTintColor={colorTheme}
              maximumTrackTintColor={themeColors.border}
              thumbTintColor={colorTheme}
            />
          </View>
          <Text style={[styles.settingTitle, { color: themeColors.text, marginBottom: 10, paddingHorizontal: 15 }]}>Engine Type</Text>
          <View style={styles.engineContainer}>
            {renderEngineButton('petrol', 'Petrol')}
            {renderEngineButton('diesel', 'Diesel')}
            {renderEngineButton('electric', 'Electric')}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>APPEARANCE</Text>
        <View style={[styles.settingsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border, padding: 15 }]}>
          <Text style={[styles.settingTitle, { color: themeColors.text, marginBottom: 15 }]}>Theme Color</Text>
          <View style={styles.colorContainer}>
            {colors.map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.colorCircle,
                  { backgroundColor: c },
                  colorTheme === c && styles.colorSelected
                ]}
                onPress={() => setColorTheme(c)}
              />
            ))}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>API LIMITS</Text>
        <View style={[styles.settingsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border, padding: 15 }]}>
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Places API Limit: {apiLimits.places}</Text>
              <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>Lifetime: {lifetimeUsage.places || 0}</Text>
            </View>
            <Slider
              style={{ width: '100%', height: 40 }}
              minimumValue={0}
              maximumValue={250}
              step={10}
              value={apiLimits.places}
              onValueChange={(val) => updateApiLimit('places', val)}
              minimumTrackTintColor={colorTheme}
              maximumTrackTintColor={themeColors.border}
              thumbTintColor={colorTheme}
            />
            <Progress.Bar progress={Math.min((apiUsage.places?.count || 0) / (apiLimits.places || 1), 1)} width={null} color={colorTheme} unfilledColor={themeColors.background} borderRadius={4} borderWidth={0} height={8} />
            <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginTop: 5 }}>{apiUsage.places?.count || 0} / {apiLimits.places} used today</Text>
          </View>

          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Directions API Limit: {apiLimits.directions}</Text>
              <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>Lifetime: {lifetimeUsage.directions || 0}</Text>
            </View>
            <Slider
              style={{ width: '100%', height: 40 }}
              minimumValue={0}
              maximumValue={250}
              step={10}
              value={apiLimits.directions}
              onValueChange={(val) => updateApiLimit('directions', val)}
              minimumTrackTintColor={colorTheme}
              maximumTrackTintColor={themeColors.border}
              thumbTintColor={colorTheme}
            />
            <Progress.Bar progress={Math.min((apiUsage.directions?.count || 0) / (apiLimits.directions || 1), 1)} width={null} color={colorTheme} unfilledColor={themeColors.background} borderRadius={4} borderWidth={0} height={8} />
            <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginTop: 5 }}>{apiUsage.directions?.count || 0} / {apiLimits.directions} used today</Text>
          </View>

          <View style={{ marginBottom: 15 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Geocoding API Limit: {apiLimits.geocode}</Text>
              <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>Lifetime: {lifetimeUsage.geocode || 0}</Text>
            </View>
            <Slider
              style={{ width: '100%', height: 40 }}
              minimumValue={0}
              maximumValue={250}
              step={10}
              value={apiLimits.geocode}
              onValueChange={(val) => updateApiLimit('geocode', val)}
              minimumTrackTintColor={colorTheme}
              maximumTrackTintColor={themeColors.border}
              thumbTintColor={colorTheme}
            />
            <Progress.Bar progress={Math.min((apiUsage.geocode?.count || 0) / (apiLimits.geocode || 1), 1)} width={null} color={colorTheme} unfilledColor={themeColors.background} borderRadius={4} borderWidth={0} height={8} />
            <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginTop: 5 }}>{apiUsage.geocode?.count || 0} / {apiLimits.geocode} used today</Text>
          </View>

          <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: 15 }]}>
            <View>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Total Lifetime Requests</Text>
              <Text style={[styles.settingDesc, { color: themeColors.textSecondary }]}>Sum of all tracked APIs</Text>
            </View>
            <Text style={{ color: colorTheme, fontWeight: 'bold', fontSize: 18 }}>
              {Object.values(lifetimeUsage).reduce((acc, curr) => acc + (typeof curr === 'number' ? curr : 0), 0)}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function AboutUsScreen() {
  return (
    <View>
      <Text>This is the about us screen.</Text>
    </View>
  )
}

/* ------------------ Tabs ------------------ */

const Tab = createBottomTabNavigator();

//Dummy component for navigator tabs.
const Empty = () => <View />;

function Tabs() {

  const onPressTravelogue = () => {
    console.log('Travelogue button pressed');
  };

  const { colorTheme, isDarkMode } = useSettings();
  const themeColors = {
    card: isDarkMode ? '#1e1e1e' : '#ffffff',
    border: isDarkMode ? '#333333' : '#e0e0e0',
    activeTab: colorTheme,
    inactiveTab: isDarkMode ? '#888888' : '#757575',
  };

  return (
    <Tab.Navigator screenOptions={{
      animation: 'shift',
      headerShown: true,
      tabBarActiveTintColor: themeColors.activeTab,
      tabBarInactiveTintColor: themeColors.inactiveTab,
      tabBarStyle: {
        backgroundColor: themeColors.card,
        borderTopColor: themeColors.border,
      }
    }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <AntDesign name="home" size={24} color={color} />
          ),
          headerShown: false
        }} />
      <Tab.Screen
        name="My Data"
        component={DataScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <AntDesign name="database" size={24} color={color} />
          )
        }} />
      <Tab.Screen
        name="Travelogue"
        component={TravelogueScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <AntDesign name="book" size={24} color={color} />
          )
        }} />
    </Tab.Navigator>
  )
}

/* ------------------ Custom Drawer ------------------ */

function CustomDrawerContent(props) {
  const { state, navigation } = props;
  const { isDarkMode, colorTheme } = useSettings();
  const themeColors = {
    background: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : 'black',
    inactiveText: isDarkMode ? '#aaaaaa' : 'gray',
  };

  const openFileManager = async () => {
    try {
      // Use our custom native module if available (Android)
      if (NativeModules.TravelSensePicker && NativeModules.TravelSensePicker.openFileManager) {
        await NativeModules.TravelSensePicker.openFileManager();
        return;
      }

      // Fallback for iOS or if native module not found
      // Note: On iOS, this will still open the document picker as there's no direct "open folder" intent.
      await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: false,
      });
    } catch (err) {
      // Ignore cancellations
    }
  };

  return (
    <DrawerContentScrollView {...props} style={{ backgroundColor: themeColors.background }}>
      <View style={styles.logoContainer}>
        <Image
          source={require('./assets/travelsense-banner.png')}
          style={styles.logo}
          resizeMode="contain"
          width={310}
        />
      </View>

      <DrawerItem
        label="Home"
        focused={state.index === 0}
        activeTintColor="white"
        inactiveTintColor={themeColors.inactiveText}
        activeBackgroundColor={colorTheme}
        labelStyle={{ color: state.index === 0 ? 'white' : themeColors.text }}
        icon={({ color, size }) => (<AntDesign name="home" size={24} color={state.index === 0 ? 'white' : themeColors.text} />)}
        onPress={() => props.navigation.navigate('Main', { screen: 'HomeScreen' })}
      />
      <DrawerItem
        label="Settings"
        focused={state.index === 1}
        activeTintColor="white"
        inactiveTintColor={themeColors.inactiveText}
        activeBackgroundColor={colorTheme}
        labelStyle={{ color: state.index === 1 ? 'white' : themeColors.text }}
        icon={({ color, size }) => (<AntDesign name="setting" size={24} color={state.index === 1 ? 'white' : themeColors.text} />)}
        onPress={() => props.navigation.navigate('Main', { screen: 'Settings' })}
      />
      <DrawerItem
        label="About Us"
        focused={state.index === 2}
        activeTintColor="white"
        inactiveTintColor={themeColors.inactiveText}
        activeBackgroundColor={colorTheme}
        labelStyle={{ color: state.index === 2 ? 'white' : themeColors.text }}
        icon={({ color, size }) => (<AntDesign name="question-circle" size={24} color={state.index === 2 ? 'white' : themeColors.text} />)}
        onPress={() => props.navigation.navigate('Main', { screen: 'About Us' })}
      />
      <DrawerItem
        label="Open Files"
        activeTintColor="white"
        inactiveTintColor={themeColors.inactiveText}
        labelStyle={{ color: themeColors.text }}
        icon={({ color, size }) => (<AntDesign name="folder" size={24} color={themeColors.text} />)}
        onPress={openFileManager}
      />
    </DrawerContentScrollView>
  );
}

/* ------------------ Drawer ------------------ */

function BatteryAutoPauseManager() {
  const { batteryThreshold } = useSettings();
  const { isPaused, setIsPaused } = useContext(RecordingContext);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onBatteryAutoPause', (event) => {
      console.log("onBatteryAutoPause native event received:", event.value);
      setIsPaused(true);
      setShowModal(true);
    });

    return () => sub.remove();
  }, [setIsPaused]);

  return (
    <Modal visible={showModal} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#1a1a2e', padding: 25, borderRadius: 15, width: '80%', elevation: 5 }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: '#e0e0e0' }}>🔋 Low Battery</Text>
          <Text style={{ marginBottom: 20, color: '#a8a8b3', lineHeight: 22 }}>Recording has been automatically paused because your battery fell below {batteryThreshold}%.</Text>
          <Pressable onPress={() => setShowModal(false)} style={{ backgroundColor: '#003CB3', padding: 12, borderRadius: 8, alignItems: 'center' }}>
            <Text style={{ color: 'white', fontWeight: 'bold' }}>I Understand</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ------------------ Notification Prompt ------------------ */

const OPT_OUT_FILE = 'notification_opt_out.txt';
const LOCATION_OPT_OUT_FILE = 'location_opt_out.txt';
const WELCOME_FILE = 'welcome_complete.txt';

async function checkOptOut(filename) {
  try {
    const file = new File(Paths.document, filename);
    if (file.exists) {
      const val = await file.text();
      return val === 'true';
    }
  } catch (e) {
    console.log(`checkOptOut (${filename}): Error reading file`, e);
  }
  return false;
}

async function saveOptOut(filename, val) {
  try {
    const file = new File(Paths.document, filename);
    await file.write(val.toString());
  } catch (e) {
    console.log(`saveOptOut (${filename}): Error writing file`, e);
  }
}

function NotificationPromptModal({ visible, onClose, onOptOut }) {
  const { isDarkMode, colorTheme } = useSettings();
  const [checked, setChecked] = useState(false);

  const handleEnable = () => {
    if (NativeModules.TravelSenseModule && NativeModules.TravelSenseModule.openNotificationSettings) {
      NativeModules.TravelSenseModule.openNotificationSettings();
    } else {
      Linking.openSettings();
    }
    onClose();
  };

  const handleNotNow = () => {
    if (checked) {
      onOptOut();
    }
    onClose();
  };

  const bgColor = isDarkMode ? '#1a1a2e' : '#FFFFFF';
  const textColor = isDarkMode ? 'white' : '#1a1a2e';
  const subTextColor = isDarkMode ? '#ccc' : '#666';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: bgColor, padding: 25, borderRadius: 15, width: '85%', elevation: 10, borderWidth: 1, borderColor: isDarkMode ? '#303050' : '#E0E0E0' }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <MaterialIcons name="notifications-active" size={50} color={colorTheme} />
            <Text style={{ color: textColor, fontSize: 22, fontWeight: 'bold', marginTop: 15, textAlign: 'center' }}>Stay in Control</Text>
          </View>

          <Text style={{ color: subTextColor, fontSize: 16, textAlign: 'center', marginBottom: 25, lineHeight: 22 }}>
            Enable notifications to manage your trip recording and access stop/pause controls directly from your status bar, even when the app is in the background.
          </Text>

          <Pressable
            onPress={() => setChecked(!checked)}
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 25, alignSelf: 'center' }}
          >
            <View style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              borderWidth: 2,
              borderColor: colorTheme,
              backgroundColor: checked ? colorTheme : 'transparent',
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 10
            }}>
              {checked && <AntDesign name="check" size={14} color="white" />}
            </View>
            <Text style={{ color: subTextColor, fontSize: 14 }}>Don't remind me again</Text>
          </Pressable>

          <View style={{ flexDirection: 'column', gap: 10 }}>
            <Pressable
              onPress={handleEnable}
              style={{ backgroundColor: colorTheme, paddingVertical: 14, borderRadius: 10, alignItems: 'center' }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Enable in Settings</Text>
            </Pressable>

            <Pressable
              onPress={handleNotNow}
              style={{ paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ color: subTextColor, fontWeight: '600', fontSize: 14 }}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function LocationPermissionModal({ visible, onClose, onAccept, onOptOut }) {
  const { isDarkMode, colorTheme } = useSettings();
  const [checked, setChecked] = useState(false);

  const handleEnable = async () => {
    onAccept();
  };

  const handleNotNow = () => {
    if (checked) {
      onOptOut();
    }
    onClose();
  };

  const bgColor = isDarkMode ? '#1a1a2e' : '#FFFFFF';
  const textColor = isDarkMode ? 'white' : '#1a1a2e';
  const subTextColor = isDarkMode ? '#ccc' : '#666';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: bgColor, padding: 25, borderRadius: 15, width: '85%', elevation: 10, borderWidth: 1, borderColor: isDarkMode ? '#303050' : '#E0E0E0' }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <MaterialIcons name="my-location" size={50} color={colorTheme} />
            <Text style={{ color: textColor, fontSize: 22, fontWeight: 'bold', marginTop: 15, textAlign: 'center' }}>Background Tracking</Text>
          </View>

          <Text style={{ color: subTextColor, fontSize: 16, textAlign: 'center', marginBottom: 25, lineHeight: 22 }}>
            To record your movement accurately when the app is closed or your screen is off, please select <Text style={{fontWeight: 'bold', color: colorTheme}}>"Allow all the time"</Text> in the next screen.
          </Text>
          
          <Text style={{ color: subTextColor, fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
            <Text style={{fontWeight: 'bold'}}>How to Enable:</Text> Go to Permissions → Location → Select "Allow all the time".
          </Text>

          <Pressable
            onPress={() => setChecked(!checked)}
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 25, alignSelf: 'center' }}
          >
            <View style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              borderWidth: 2,
              borderColor: colorTheme,
              backgroundColor: checked ? colorTheme : 'transparent',
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 10
            }}>
              {checked && <AntDesign name="check" size={14} color="white" />}
            </View>
            <Text style={{ color: subTextColor, fontSize: 14 }}>Don't remind me again</Text>
          </Pressable>

          <View style={{ flexDirection: 'column', gap: 10 }}>
            <Pressable
              onPress={handleEnable}
              style={{ backgroundColor: colorTheme, paddingVertical: 14, borderRadius: 10, alignItems: 'center' }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Go to Settings</Text>
            </Pressable>

            <Pressable
              onPress={handleNotNow}
              style={{ paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ color: subTextColor, fontWeight: '600', fontSize: 14 }}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ActiveTrackingGuidanceModal({ visible, onClose, onConfirm }) {
  const { isDarkMode, colorTheme } = useSettings();

  const bgColor = isDarkMode ? '#1a1a2e' : '#FFFFFF';
  const textColor = isDarkMode ? 'white' : '#1a1a2e';
  const subTextColor = isDarkMode ? '#ccc' : '#666';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: bgColor, padding: 25, borderRadius: 15, width: '85%', elevation: 10, borderWidth: 1, borderColor: isDarkMode ? '#303050' : '#E0E0E0' }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <MaterialIcons name="navigation" size={50} color={colorTheme} />
            <Text style={{ color: textColor, fontSize: 22, fontWeight: 'bold', marginTop: 15, textAlign: 'center' }}>Active Trip Tracking</Text>
          </View>

          <Text style={{ color: subTextColor, fontSize: 16, textAlign: 'center', marginBottom: 15, lineHeight: 22 }}>
            To record your live path and provide accurate feedback, we need permission to track your location <Text style={{fontWeight: 'bold', color: textColor}}>"While Using the App."</Text>
          </Text>
          
          <Text style={{ color: subTextColor, fontSize: 14, textAlign: 'center', marginBottom: 15 }}>
            <Text style={{fontWeight: 'bold'}}>How to Enable:</Text> Go to Permissions → Location → Select "While using the app".
          </Text>
          
          <Text style={{ color: subTextColor, fontSize: 13, textAlign: 'center', marginBottom: 25, fontStyle: 'italic' }}>
            Note: Background tracking (screen off) is separate. We need both to ensure your trip data is never interrupted.
          </Text>

          <View style={{ flexDirection: 'column', gap: 10 }}>
            <Pressable
              onPress={onConfirm}
              style={{ backgroundColor: colorTheme, paddingVertical: 14, borderRadius: 10, alignItems: 'center' }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Grant Permission</Text>
            </Pressable>

            <Pressable
              onPress={onClose}
              style={{ paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ color: subTextColor, fontWeight: '600', fontSize: 14 }}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function InitialWelcomeModal({ visible, onProceed, onClose }) {
  const { isDarkMode, colorTheme } = useSettings();

  const bgColor = isDarkMode ? '#1a1a2e' : '#FFFFFF';
  const textColor = isDarkMode ? 'white' : '#1a1a2e';
  const subTextColor = isDarkMode ? '#ccc' : '#666';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: bgColor, padding: 25, borderRadius: 15, width: '90%', elevation: 15, borderWidth: 1, borderColor: isDarkMode ? '#303050' : '#E0E0E0' }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <Image 
              source={require('./assets/travelsense-banner.png')} 
              style={{ width: '100%', height: 60, marginBottom: 20 }}
              resizeMode="contain"
            />
            <MaterialIcons name="security" size={40} color={colorTheme} />
            <Text style={{ color: textColor, fontSize: 24, fontWeight: 'bold', marginTop: 10, textAlign: 'center' }}>Welcome to TravelSense</Text>
          </View>

          <Text style={{ color: subTextColor, fontSize: 16, textAlign: 'left', marginBottom: 15, lineHeight: 22 }}>
            To accurately record your driving trips and analyze road safety, this app requires access to your sensors:
          </Text>

          <View style={{ marginBottom: 25 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <MaterialIcons name="location-on" size={20} color={colorTheme} style={{ marginRight: 10 }} />
              <Text style={{ color: textColor, fontSize: 14, fontWeight: '600' }}>High-Precision Location</Text>
            </View>
            <Text style={{ color: subTextColor, fontSize: 13, marginLeft: 30, marginBottom: 10 }}>Required to track your route and calculate vehicle speeds.</Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <MaterialIcons name="directions-car" size={20} color={colorTheme} style={{ marginRight: 10 }} />
              <Text style={{ color: textColor, fontSize: 14, fontWeight: '600' }}>Physical Activity</Text>
            </View>
            <Text style={{ color: subTextColor, fontSize: 13, marginLeft: 30 }}>Helps detect when you are driving to optimize battery life by starting sensors only when needed.</Text>
          </View>

          <View style={{ flexDirection: 'column', gap: 10 }}>
            <Pressable
              onPress={onProceed}
              style={{ backgroundColor: colorTheme, paddingVertical: 14, borderRadius: 10, alignItems: 'center' }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Agree and Continue</Text>
            </Pressable>

            <Pressable
              onPress={onClose}
              style={{ paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ color: subTextColor, fontWeight: '600', fontSize: 14 }}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ActivityRecognitionGuidanceModal({ visible, onClose, onConfirm }) {
  const { isDarkMode, colorTheme } = useSettings();

  const bgColor = isDarkMode ? '#1a1a2e' : '#FFFFFF';
  const textColor = isDarkMode ? 'white' : '#1a1a2e';
  const subTextColor = isDarkMode ? '#ccc' : '#666';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: bgColor, padding: 25, borderRadius: 15, width: '85%', elevation: 10, borderWidth: 1, borderColor: isDarkMode ? '#303050' : '#E0E0E0' }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <MaterialIcons name="directions-car" size={50} color={colorTheme} />
            <Text style={{ color: textColor, fontSize: 22, fontWeight: 'bold', marginTop: 15, textAlign: 'center' }}>Smart Trip Detection</Text>
          </View>

          <Text style={{ color: subTextColor, fontSize: 16, textAlign: 'center', marginBottom: 15, lineHeight: 22 }}>
            This permission allows TravelSense to detect when you are driving automatically. 
          </Text>
          
          <Text style={{ color: subTextColor, fontSize: 14, textAlign: 'center', marginBottom: 15 }}>
            <Text style={{fontWeight: 'bold'}}>How to Enable:</Text> Go to Permissions → Physical Activity → Select "Allow".
          </Text>
          
          <Text style={{ color: subTextColor, fontSize: 13, textAlign: 'center', marginBottom: 25, fontStyle: 'italic' }}>
            Benefit: It significantly reduces battery drain by only activating GPS when vehicle movement is detected.
          </Text>

          <View style={{ flexDirection: 'column', gap: 10 }}>
            <Pressable
              onPress={onConfirm}
              style={{ backgroundColor: colorTheme, paddingVertical: 14, borderRadius: 10, alignItems: 'center' }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Enable Detection</Text>
            </Pressable>

            <Pressable
              onPress={onClose}
              style={{ paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ color: subTextColor, fontWeight: '600', fontSize: 14 }}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const Drawer = createDrawerNavigator();

export default function App({ navigation }) {
  const { batteryThreshold } = useSettings();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const serviceStarted = useRef(false);
  const hasCheckedNotifications = useRef(false);
  const [showBatteryModal, setShowBatteryModal] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(null); // 'welcome', 'fg_guidance', 'activity_guidance', 'bg_guidance', 'notifications'

  const handleExitRequest = () => {
    Alert.alert(
      'Exit TravelSense',
      'Are you sure you want to exit?',
      [
        { text: 'Not really', style: 'cancel' },
        {
          text: 'Yes',
          onPress: async () => {
            await SensorUpload.persistToDisk();
            if (NativeModules.TravelSenseModule && NativeModules.TravelSenseModule.exitApp) {
              NativeModules.TravelSenseModule.exitApp();
            } else {
              BackHandler.exitApp();
            }
          }
        },
      ]
    );
  };

  const checkNotificationStatus = async () => {
    if (hasCheckedNotifications.current) return;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const optedOut = await checkOptOut(OPT_OUT_FILE);
        if (!optedOut) {
          setOnboardingStep(null);
          setTimeout(() => setOnboardingStep('notifications'), 100);
        }
      }
      hasCheckedNotifications.current = true;
    } catch (e) {
      console.error("checkNotificationStatus error:", e);
    }
  };

  const openSettings = async () => {
    if (NativeModules.TravelSenseModule && NativeModules.TravelSenseModule.openNotificationSettings) {
        // We use the existing openNotificationSettings or a generic one
        // On Android, APP_NOTIFICATION_SETTINGS is specific, but we can use APP_DETAILS_SETTINGS
    }
    // Generic React Native way:
    const pkg = "package:" + (NativeModules.TravelSenseModule ? "com.travelsense.TravelSense" : "");
    const supported = await Linking.openSettings();
  };

  const waitForFocus = () => {
    return new Promise((resolve) => {
      // If already active, resolve immediately or after a slight delay
      if (AppState.currentState === 'active') {
        setTimeout(resolve, 300);
        return;
      }
      
      const sub = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') {
          sub.remove();
          setTimeout(resolve, 500); 
        }
      });
    });
  };

  const startPermissionSequence = async (isRetry = false) => {
    // Stage 1: Foreground Location
    const startTime = Date.now();
    await Location.requestForegroundPermissionsAsync();
    const duration = Date.now() - startTime;
    await waitForFocus();
    
    // Check status after dialog
    const { status: foreStatus } = await Location.getForegroundPermissionsAsync();
    
    // If it failed instantly and we are from a modal, jump to settings
    if (foreStatus !== 'granted' && isRetry && duration < 250) {
      if (NativeModules.TravelSenseModule && NativeModules.TravelSenseModule.openAppSettings) {
        NativeModules.TravelSenseModule.openAppSettings();
      } else {
        Linking.openSettings();
      }
      await waitForFocus();
      // After manual setting, proceed to activity
      await startActivitySequence();
      return;
    }

    if (foreStatus !== 'granted') {
      setOnboardingStep('fg_guidance');
      return; 
    }

    // Stage 2: Physical Activity (Continue even if foreground ok)
    await startActivitySequence();
  };

  const startActivitySequence = async (isRetry = false) => {
    if (NativeModules.TravelSenseModule && NativeModules.TravelSenseModule.requestActivityRecognitionPermission) {
      const startTime = Date.now();
      const result = await NativeModules.TravelSenseModule.requestActivityRecognitionPermission().catch(() => 'error');
      const duration = Date.now() - startTime;
      
      // If result is 'granted', move on
      if (result === 'granted') {
        await startBackgroundSequence();
        return;
      }

      // If it failed instantly (< 250ms) and we are from a modal, the OS likely blocked it
      if (isRetry && duration < 250) {
        // App settings is the only way
        if (NativeModules.TravelSenseModule.openAppSettings) {
          NativeModules.TravelSenseModule.openAppSettings();
        } else {
          Linking.openSettings();
        }
        await waitForFocus();
        await startBackgroundSequence();
        return;
      }

      // If it's a first-time check (not from modal) and denied, show guidance
      if (!isRetry) {
        setOnboardingStep('activity_guidance');
      } else {
        // Human manual denial from a modal, just move to next stage
        await startBackgroundSequence();
      }
    } else {
      await startBackgroundSequence();
    }
  };

  const startBackgroundSequence = async () => {
    const { status: backStatus } = await Location.getBackgroundPermissionsAsync();
    if (backStatus !== 'granted') {
      const optedOut = await checkOptOut(LOCATION_OPT_OUT_FILE);
      if (!optedOut) {
        setOnboardingStep('bg_guidance');
      } else {
        setTimeout(() => checkNotificationStatus(), 500);
      }
    } else {
      setTimeout(() => checkNotificationStatus(), 500);
    }
  };

  useEffect(() => {
    SensorUpload.loadFromDisk();
    
    const checkInitialStatus = async () => {
      const { status: foreStatus } = await Location.getForegroundPermissionsAsync();
      if (foreStatus !== 'granted') {
        const welcomeComplete = await checkOptOut(WELCOME_FILE);
        if (!welcomeComplete) {
          setOnboardingStep('welcome');
        } else {
          setOnboardingStep('fg_guidance');
        }
      } else {
        startPermissionSequence();
      }
    };
    
    checkInitialStatus();

    if (!NativeModules.TravelSenseModule) return;

    const pauseSub = DeviceEventEmitter.addListener('onNotificationPauseToggle', () => setIsPaused(prev => !prev));
    const tickSub = DeviceEventEmitter.addListener('onServiceTick', (event) => {
      if (event && event.value !== undefined) setElapsedTime(event.value);
    });
    const exitSub = DeviceEventEmitter.addListener('onNotificationExit', () => handleExitRequest());
    const batterySub = DeviceEventEmitter.addListener('onBatteryAutoPause', () => {
      setIsPaused(true);
      setShowBatteryModal(true);
    });

    return () => {
      pauseSub.remove();
      tickSub.remove();
      exitSub.remove();
      batterySub.remove();
    };
  }, []);

  const syncServiceState = async () => {
    if (NativeModules.TravelSenseModule && NativeModules.TravelSenseModule.getServiceState) {
      const state = await NativeModules.TravelSenseModule.getServiceState();
      if (state) {
        console.log("Syncing with active service:", state);
        setElapsedTime(state.elapsedTime);
        setIsPaused(state.isPaused);
        if (state.isBatteryPaused) {
          setShowBatteryModal(true);
        }
        serviceStarted.current = true;
        return true;
      }
    }
    return false;
  };

  const startServiceIfPermitted = async () => {
    if (serviceStarted.current || !NativeModules.TravelSenseModule) return;

    const alreadyRunning = await syncServiceState();
    if (alreadyRunning) return;

    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'granted') {
      if (AppState.currentState === 'active') {
        console.log("Starting Foreground Service (Permissions Verified and App Active)");
        serviceStarted.current = true;
        NativeModules.TravelSenseModule.startRecordingService(elapsedTime, false, batteryThreshold);
        return true;
      } else {
        console.log("Status is granted, but App is in background. Deferring service start.");
      }
    }
    return false;
  };

  useEffect(() => {
    let checkInterval;

    const handleAppState = async (nextState) => {
      if (nextState === 'active') {
        const running = await syncServiceState();
        if (!running) {
          const started = await startServiceIfPermitted();
          if (started && checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
          }
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);

    const init = async () => {
      const running = await syncServiceState();
      if (!running) {
        const started = await startServiceIfPermitted();
        if (!started) {
          checkInterval = setInterval(async () => {
            const nowRunning = await syncServiceState();
            if (nowRunning) {
              clearInterval(checkInterval);
              checkInterval = null;
            } else {
              const nowStarted = await startServiceIfPermitted();
              if (nowStarted && checkInterval) {
                clearInterval(checkInterval);
                checkInterval = null;
              }
            }
          }, 2000);
        }
      }
    };

    init();

    return () => {
      sub.remove();
      if (checkInterval) clearInterval(checkInterval);
    };
  }, []);

  useEffect(() => {
    if (NativeModules.TravelSenseModule && serviceStarted.current) {
      NativeModules.TravelSenseModule.updateServiceState(-1, isPaused, batteryThreshold);
    }
  }, [isPaused, batteryThreshold]);

  useEffect(() => {
    const backAction = () => {
      if (navigationRef.isReady() && navigationRef.canGoBack()) {
        navigationRef.goBack();
        return true;
      }

      handleExitRequest();
      return true; // prevent default behavior
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, []);

  // Note: Permission sequence is now strictly linear through startPermissionSequence
  // Redundant AppState listener removed to prevent overlapping modals during dialog transitions.

  return (
    <RecordingContext.Provider value={{ isPaused, setIsPaused, elapsedTime, setElapsedTime }}>
      <Modal visible={showBatteryModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#1a1a2e', padding: 25, borderRadius: 15, width: '80%', elevation: 5 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: '#e0e0e0' }}>🔋 Low Battery</Text>
            <Text style={{ marginBottom: 20, color: '#a8a8b3', lineHeight: 22 }}>Recording has been automatically paused because your battery fell below {batteryThreshold}%.</Text>
            <Pressable onPress={() => setShowBatteryModal(false)} style={{ backgroundColor: '#003CB3', padding: 12, borderRadius: 8, alignItems: 'center' }}>
              <Text style={{ color: 'white', fontWeight: 'bold' }}>I Understand</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <NavigationContainer ref={navigationRef}>
        <Drawer.Navigator
          drawerContent={(props) => <CustomDrawerContent {...props} />}
          screenOptions={{
            headerShown: false, drawerType: "front", detachInactiveScreens: false,
          }}
        >
          <Drawer.Screen name="Main" component={DrawerStack} />
        </Drawer.Navigator>
      </NavigationContainer>
      <NotificationPromptModal
        visible={onboardingStep === 'notifications'}
        onClose={() => setOnboardingStep(null)}
        onOptOut={async () => {
          await saveOptOut(OPT_OUT_FILE, true);
          setOnboardingStep(null);
        }}
      />
      <LocationPermissionModal
        visible={onboardingStep === 'bg_guidance'}
        onClose={async () => {
          setOnboardingStep(null);
          setTimeout(() => checkNotificationStatus(), 100);
        }}
        onAccept={async () => {
          setOnboardingStep(null);
          await Location.requestBackgroundPermissionsAsync();
          await waitForFocus(); // Wait for user to return from settings
          setTimeout(() => checkNotificationStatus(), 100);
        }}
        onOptOut={async () => {
          await saveOptOut(LOCATION_OPT_OUT_FILE, true);
          setOnboardingStep(null);
          setTimeout(() => checkNotificationStatus(), 100);
        }}
      />
      <InitialWelcomeModal
        visible={onboardingStep === 'welcome'}
        onProceed={async () => {
          await saveOptOut(WELCOME_FILE, true);
          setOnboardingStep(null);
          setTimeout(() => startPermissionSequence(), 300);
        }}
        onClose={() => setOnboardingStep(null)}
      />
      <ActiveTrackingGuidanceModal
        visible={onboardingStep === 'fg_guidance'}
        onConfirm={async () => {
           setOnboardingStep(null);
           // After granting foreground, proceed to Activity Recognition
           setTimeout(async () => {
               await startPermissionSequence(true);
           }, 300);
        }}
        onClose={() => {
           setOnboardingStep(null);
           // Regardless of location result, always prompt for Activity next
           setTimeout(() => startActivitySequence(), 300);
        }}
      />
      <ActivityRecognitionGuidanceModal
        visible={onboardingStep === 'activity_guidance'}
        onConfirm={async () => {
           setOnboardingStep(null);
           // After attempting, if it fails, the next call will trigger settings fallback
           setTimeout(() => startActivitySequence(true), 300);
        }}
        onClose={() => {
           setOnboardingStep(null);
           // Proceed to next sequence anyway
           setTimeout(() => startBackgroundSequence(), 300);
        }}
      />
    </RecordingContext.Provider>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: "black",
  },
  screen: {
    padding: 15,
    flex: 1,
  },
  wrapper: {
    width: "100%",
    padding: 10,
    justifyContent: "left",
    flexDirection: "row",
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 25,
    height: 50,
    padding: 10,
    marginHorizontal: 0,
    borderWidth: 0,
    textAlignVertical: "center",
  },
  searchContainer: {
    backgroundColor: "white",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 25,
    overflow: "hidden",
    elevation: 10,
  },
  iconWrapper: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    width: 50,
    height: 50,
  },
  inputWrapper: {
    flex: 0,
  },
  settingsScreen: {
    padding: 15,
    flex: 1,
  },
  engineContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
  },
  engineButton: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  engineText: {
    fontWeight: '600',
  },
  colorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  colorCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSelected: {
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  settingsCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 15,
    marginBottom: 8,
    letterSpacing: 1,
  },
  headerText: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    marginLeft: 5,
  },
  input: {
    color: "gray",
    fontSize: 16,
  },
  dropdown: {
    position: 'absolute',
    top: 60,
    backgroundColor: 'white',
    borderRadius: 12,
    maxHeight: 350,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    overflow: 'hidden',
    width: Dimensions.get('window').width - 20,
    zIndex: 1000,
  },
  searchRightIcons: {
    position: 'absolute',
    right: 0,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e8e8',
  },
  dropdownIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  dropdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  dropdownSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  navChipsRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  navChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    gap: 6,
  },
  navChipStart: {
    backgroundColor: '#003CB3',
  },
  navChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#003CB3',
  },
  detailsCard: {
    position: 'absolute',
    bottom: 20,
    left: 15,
    right: 15,
    borderRadius: 20,
    padding: 20,
    elevation: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    zIndex: 900,
  },
  detailsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  detailsAddress: {
    fontSize: 14,
    marginBottom: 8,
  },
  detailsMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 6,
    marginBottom: 16,
  },
  detailsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  detailsChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  // Bottom Sheet layout info
  // Route panel (bottom card during directions mode)
  routePanel: {
    position: 'absolute',
    bottom: 20,
    left: 15,
    right: 15,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    elevation: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    zIndex: 900,
  },
  routePanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  routePanelTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
  },
  routePanelClose: {
    padding: 4,
  },
  routeOption: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 120,
  },
  routeOptionSelected: {
    borderColor: '#003CB3',
    backgroundColor: '#EEF2FF',
  },
  routeOptionDuration: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  routeOptionDistance: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  startNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#003CB3',
    borderRadius: 25,
    paddingVertical: 14,
    gap: 8,
  },
  startNavButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  // Navigation instruction card (top, driving mode)
  navInstructionCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#003CB3',
    paddingTop: 48,
    paddingBottom: 14,
    paddingHorizontal: 16,
    elevation: 10,
    zIndex: 10,
  },
  navInstructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navInstructionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  navInstructionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  navInstructionSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginTop: 2,
  },
  navStepProgress: {
    marginTop: 8,
    alignItems: 'flex-end',
  },
  navStepProgressText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
  // ETA bar + exit button (bottom, driving mode)
  navExitContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  navEtaBar: {
    backgroundColor: 'white',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  navEtaDuration: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  navEtaDistance: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  navExitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D32F2F',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 4,
  },
  navExitText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
});