import {
  View,
  Text,
  Image,
  ImageBackground,
  ScrollView,
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
  PanResponder,
  Modal
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ButtonRound from "./components/ButtonRound"
import GraphCard from './components/GraphCard';
import { useSensorData } from './src/sensors/Sensor';
import DateTimePicker from '@react-native-community/datetimepicker';

const mapImg = require("./assets/carte-geographique-du-monde.jpg");
import {
  NavigationContainer,
  createStaticNavigation,
  useNavigation,
} from '@react-navigation/native';
import { createBottomTabNavigator, useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useEffect, useRef, useState, memo, forwardRef } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  runOnJS,
  LinearTransition,
  FadeInDown,
  FadeOutUp,
} from 'react-native-reanimated';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItem,
} from '@react-navigation/drawer';
import Svg, { Polygon } from 'react-native-svg';
import * as Progress from 'react-native-progress';
import MapView, { PROVIDER_GOOGLE, Polyline, Marker } from 'react-native-maps';
import { Accelerometer, Gyroscope } from "expo-sensors";
import {
  Canvas,
  Path,
  Skia,
  Group,
  useDerivedValue,
} from "@shopify/react-native-skia";
import { GestureHandlerRootView, Gesture, GestureDetector } from "react-native-gesture-handler";
import { SettingsProvider, useSettings } from './src/contexts/SettingsContext';

//Icons
import Entypo from '@expo/vector-icons/Entypo';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AntDesign from '@expo/vector-icons/AntDesign';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

/* ------------------ Screens ------------------ */

const Stack = createNativeStackNavigator();

function DrawerStack() {
  return (
    <Stack.Navigator screenOptions={{
      animation: 'default', headerShown: true
    }}>
      <Stack.Screen name="TabsRoot" component={Tabs} options={{ headerShown: false }} />
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

  const onLayout = (event) => {
    maxSearchWidth.value = event.nativeEvent.layout.width;
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
    const keybHidden = Keyboard.addListener('keyboardDidHide', () => toggleSearch());

    return () => {
      keybHidden.remove();
    };
  }, [isSearchBarFocused]);

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
      }
    }
  };

  //Resizes the input field container.
  const searchBarStyle = useAnimatedStyle(() => {
    return {
      width: interpolate(progress.value, [0, 1], [50, screenWidth - 140]),
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

  const onRunFunction = (barStyle) => {
    setBarStyle(barStyle);
  };

  //Fullscreen component
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener('drawerClose', () => {
      onRunFunction('light-content');
    });
    return unsubscribe;
  }, [navigation]);
  return (
    <View style={styles.fullscreen}>
      <MapView provider={PROVIDER_GOOGLE} style={StyleSheet.absoluteFillObject} />
      <StatusBar translucent backgroundColor="transparent" barStyle={barStyle} />
      {/* <ImageBackground source={mapImg} style={{ flex: 1 }}> */}
      <View style={{ flex: 1 }}>
        <SafeAreaView style={styles.wrapper} onLayout={onLayout}>

          <ButtonRound onPress={() => {
            navigation.openDrawer();
            onRunFunction('dark-content')
          }}>
            <Entypo name="menu" size={24} color="black" />
          </ButtonRound>

          <Pressable onPress={toggleSearch} style={{ flex: 0 }}>
            <Animated.View style={[styles.searchContainer, searchBarStyle]}>
              <Animated.View style={[styles.iconWrapper, iconStyle]}>
                <FontAwesome name="search" size={20} color="black" />
              </Animated.View>
              <Animated.View style={[styles.inputWrapper, inputStyle]}>
                <TextInput placeholder="Search TravelSense..." style={styles.input} ref={inputRef} readOnly={isSearchBarFocused} />
              </Animated.View>
            </Animated.View>
          </Pressable>

          <ButtonRound onPress={() => console.log("hello")}>
            <Entypo name="location-pin" size={24} color="black" />
          </ButtonRound>

        </SafeAreaView>
      </View>
    </View>
  );
}

function DataScreen() {
  const padding = 15;
  const tabBarHeight = useBottomTabBarHeight();
  const sensorState = useSensorData();
  const { isDarkMode, colorTheme } = useSettings();

  const themeColors = {
    background: isDarkMode ? '#121212' : '#f5f5f5',
    card: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : '#000000',
  };

  return (
    <View style={[styles.screen, { padding: padding, backgroundColor: themeColors.background }]}>
      <View style={{ backgroundColor: themeColors.card, borderRadius: 25, height: 150, overflow: 'hidden' }}>
        <View style={{ backgroundColor: colorTheme, flexDirection: 'row' }}>
          <Text style={{ color: 'white', fontWeight: 'bold', left: 12.5, fontSize: 17.5 }}>STATUS: TRAVELLING</Text>
          <Svg height="23" width="100%" viewBox="0 0 20 2">
            <Polygon
              points="0,0 15,0 15,15 20,20"
              fill={colorTheme}
            />
          </Svg>
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 17.5, position: "absolute", right: 25 }}>AUTO: ON</Text>
        </View>

        <View style={{ backgroundColor: themeColors.card, flex: 1, padding: padding }}>
          <View style={{ flexDirection: "row" }}>
            <Text style={{ color: themeColors.text, fontSize: 60, fontWeight: "bold", includeFontPadding: false, lineHeight: 50 }}>60</Text>
            <Text style={{ color: themeColors.text, textAlignVertical: "bottom", bottom: 0, marginLeft: 3 }}>km/h</Text>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", marginLeft: 5 }}>
              <View>
                <Text style={{ color: themeColors.text }}>RECORDING: </Text>
                <Text style={{ color: themeColors.text }}>05:13:45</Text>
              </View>
              <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-evenly" }}>
                <ButtonRound size={30} onPress={() => { }}>
                  <FontAwesome5 name="pause" size={15} color={isDarkMode ? 'white' : 'black'} />
                </ButtonRound>
                <ButtonRound size={30} onPress={() => { }}>
                  <FontAwesome5 name="stop" size={15} color={isDarkMode ? 'white' : 'black'} />
                </ButtonRound>
                <ButtonRound size={30} onPress={() => { }}>
                  <Feather name="x" size={15} color={isDarkMode ? 'white' : 'black'} />
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
  );
}

function RouteScrubber({ onProgressUpdate, initialProgress, colorTheme, themeColors, startTime, endTime }) {
  const progress = useSharedValue(initialProgress);
  const barWidth = useSharedValue(0);

  const animatedThumbStyle = useAnimatedStyle(() => ({
    left: `${progress.value * 100}%`,
  }));

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const pan = Gesture.Pan()
    .onBegin((e) => {
      'worklet';
      if (barWidth.value <= 0) return;
      let p = e.x / barWidth.value;
      p = Math.max(0, Math.min(1, p));
      progress.value = p;
      runOnJS(onProgressUpdate)(p, true); // true = jump/begin
    })
    .onUpdate((e) => {
      'worklet';
      if (barWidth.value <= 0) return;
      let p = e.x / barWidth.value;
      p = Math.max(0, Math.min(1, p));
      progress.value = p;
      runOnJS(onProgressUpdate)(p, false); // false = drag
    });

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ color: themeColors.textSecondary, fontSize: 11, fontWeight: '600' }}>{startTime}</Text>
        <Text style={{ color: themeColors.textSecondary, fontSize: 11, fontWeight: '600' }}>{endTime}</Text>
      </View>
      <GestureDetector gesture={pan}>
        <View
          style={{ height: 30, justifyContent: 'center' }}
          onLayout={(e) => { barWidth.value = e.nativeEvent.layout.width; }}
        >
          <View style={{ height: 6, backgroundColor: themeColors.border, borderRadius: 3, width: '100%' }}>
            <Animated.View style={[{ height: '100%', backgroundColor: colorTheme, borderRadius: 3 }, animatedProgressStyle]} />
            <Animated.View style={[{
              position: 'absolute',
              top: -7,
              marginLeft: -10,
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: 'white',
              borderWidth: 3,
              borderColor: colorTheme,
              elevation: 3,
            }, animatedThumbStyle]} />
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

const MemoizedTripMap = memo(forwardRef(({ currentTrip, carPos, colorTheme, selectedTripId }, ref) => {
  return (
    <MapView
      ref={ref}
      provider={PROVIDER_GOOGLE}
      style={{ flex: 1 }}
      initialRegion={{
        latitude: 9.98,
        longitude: 76.32,
        latitudeDelta: 0.15,
        longitudeDelta: 0.15,
      }}
    >
      {selectedTripId && currentTrip && (
        <>
          <Polyline
            coordinates={currentTrip.coordinates}
            strokeColor={colorTheme}
            strokeWidth={4}
          />
          <Marker coordinate={carPos}>
            <View style={{
              backgroundColor: 'white',
              padding: 8,
              borderRadius: 20,
              elevation: 5,
              borderWidth: 2,
              borderColor: colorTheme,
            }}>
              <FontAwesome5 name="car" size={18} color={colorTheme} />
            </View>
          </Marker>
        </>
      )}
    </MapView>
  );
}), (prev, next) => {
  return (
    prev.selectedTripId === next.selectedTripId &&
    prev.carPos?.latitude === next.carPos?.latitude &&
    prev.carPos?.longitude === next.carPos?.longitude &&
    prev.currentTrip?.id === next.currentTrip?.id
  );
});

const MemoizedTripCard = memo(({ trip, index, isSelected, onSelect, carProgress, colorTheme, themeColors, onScrubberInteraction, onLayout }) => {
  return (
    <Animated.View 
      onLayout={onLayout}
      layout={LinearTransition}
      style={{
        backgroundColor: themeColors.card,
        borderRadius: 20,
        marginBottom: 15,
        elevation: isSelected ? 8 : 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isSelected ? 0.2 : 0.1,
        shadowRadius: 4,
        borderWidth: 2,
        borderColor: isSelected ? colorTheme : themeColors.border,
        overflow: 'hidden'
      }}
    >
      <Pressable 
        onPress={() => onSelect(trip.id)}
        style={({ pressed }) => ({
          padding: 20,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: isSelected ? 20 : 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{
              backgroundColor: colorTheme + '20',
              padding: 12,
              borderRadius: 15,
              marginRight: 15,
            }}>
              <FontAwesome5 name="route" size={20} color={colorTheme} />
            </View>
            <View>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: themeColors.text }}>Trip {index + 1}</Text>
              <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>{trip.duration} • {trip.distance}</Text>
            </View>
          </View>
        </View>
      </Pressable>

      {isSelected && (
        <Animated.View 
          entering={FadeInDown.duration(300)}
          exiting={FadeOutUp.duration(200)}
          style={{ width: '100%', paddingHorizontal: 20, paddingBottom: 20 }}
        >
          <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginBottom: 10, fontWeight: '600' }}>
            Tap or drag to trace route
          </Text>
          <RouteScrubber 
            initialProgress={carProgress / (trip.coordinates.length - 1)}
            onProgressUpdate={(p, isBegin) => {
              onScrubberInteraction && onScrubberInteraction(p, trip, isBegin);
            }}
            colorTheme={colorTheme}
            themeColors={themeColors}
            startTime={trip.startTime}
            endTime={trip.endTime}
          />
        </Animated.View>
      )}
    </Animated.View>
  );
}, (prev, next) => {
  // Optimization: Skip re-render if not selected and selection didn't change
  if (prev.isSelected !== next.isSelected) return false;
  if (next.isSelected && prev.carProgress !== next.carProgress) return false;
  return true;
});

function HorizontalCalendar({ colorTheme, themeColors, selectedDate, onDateSelect, centerDate }) {
  const today = new Date().toDateString();
  const dates = [];
  const baseDate = new Date(centerDate || selectedDate);
  
  // Generate 7 days around the base (centered) date
  for (let i = -3; i <= 3; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const fullDate = d.toDateString();
    dates.push({
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dateNum: d.getDate(),
      isToday: fullDate === today,
      isSelected: fullDate === selectedDate,
      fullDate: fullDate
    });
  }

  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false} 
      contentContainerStyle={{ paddingVertical: 10 }}
    >
      {dates.map((item, index) => (
        <Pressable 
          key={index}
          onPress={() => onDateSelect(item.fullDate)}
          style={{
            width: 60,
            height: 80,
            backgroundColor: item.isSelected ? colorTheme : themeColors.card,
            borderRadius: 20,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 12,
            borderWidth: item.isSelected ? 0 : 1,
            borderColor: themeColors.border,
            elevation: item.isSelected ? 5 : 0,
            shadowColor: colorTheme,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: item.isSelected ? 0.3 : 0,
            shadowRadius: 4,
          }}
        >
          <Text style={{ 
            fontSize: 12, 
            color: item.isSelected ? 'white' : themeColors.textSecondary,
            fontWeight: '600',
            marginBottom: 5 
          }}>
            {item.dayName}
          </Text>
          <Text style={{ 
            fontSize: 20, 
            color: item.isSelected ? 'white' : themeColors.text,
            fontWeight: 'bold' 
          }}>
            {item.dateNum}
          </Text>
          {item.isToday && (
            <View style={{ 
              width: 5, 
              height: 5, 
              borderRadius: 2.5, 
              backgroundColor: item.isSelected ? 'white' : colorTheme, 
              marginTop: 5 
            }} />
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

function TravelogueScreen() {
  const { isDarkMode, colorTheme } = useSettings();
  const [selectedDate, setSelectedDate] = useState(new Date().toDateString());
  const [selectedCenterDate, setSelectedCenterDate] = useState(new Date().toDateString());
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [carProgress, setCarProgress] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  
  const mapRef = useRef(null);
  const listRef = useRef(null);
  const cardPositions = useRef({});
  
  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setSelectedCenterDate(date);
    setSelectedTripId(null);
    setCarProgress(0);
  };

  const onDateChange = (event, selectedDateObj) => {
    // Hide picker immediately after selection/cancel
    setShowPicker(false);
    
    if (selectedDateObj) {
      handleDateSelect(selectedDateObj.toDateString());
    }
  };

  const themeColors = {
    background: isDarkMode ? '#121212' : '#f5f5f5',
    card: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : '#000000',
    textSecondary: isDarkMode ? '#aaaaaa' : '#666666',
    border: isDarkMode ? '#333333' : '#e0e0e0',
  };

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const handleTripSelect = (id) => {
    const isExpanding = selectedTripId !== id;
    setSelectedTripId(isExpanding ? id : null);
    setCarProgress(0);

    // Auto-scroll to ensure expansion is visible
    if (isExpanding && cardPositions.current[id] !== undefined) {
      setTimeout(() => {
        listRef.current?.scrollTo({ 
          y: cardPositions.current[id], 
          animated: true 
        });
      }, 100);
    }
  };

  // Mock trips data with coordinates
  const [trips, setTrips] = useState([
    {
      id: 1, duration: '45 mins', distance: '12.4 km',
      startTime: '09:00 AM', endTime: '09:45 AM',
      date: new Date().toDateString(),
      coordinates: [
        { latitude: 9.9312, longitude: 76.2673 },
        { latitude: 9.9350, longitude: 76.2850 },
        { latitude: 9.9500, longitude: 76.3000 },
        { latitude: 9.9700, longitude: 76.3150 },
        { latitude: 9.9910, longitude: 76.3300 },
        { latitude: 10.0050, longitude: 76.3500 },
        { latitude: 10.0150, longitude: 76.3650 },
        { latitude: 10.0250, longitude: 76.3800 },
      ]
    },
    {
      id: 2, duration: '30 mins', distance: '8.2 km',
      startTime: '10:30 AM', endTime: '11:00 AM',
      date: new Date().toDateString(),
      coordinates: [
        { latitude: 10.0250, longitude: 76.3800 },
        { latitude: 10.0150, longitude: 76.3650 },
        { latitude: 10.0050, longitude: 76.3500 },
        { latitude: 9.9910, longitude: 76.3300 },
      ]
    },
    {
      id: 3, duration: '15 mins', distance: '4.5 km',
      startTime: '01:15 PM', endTime: '01:30 PM',
      date: new Date().toDateString(),
      coordinates: [
        { latitude: 9.9910, longitude: 76.3300 },
        { latitude: 9.9800, longitude: 76.3200 },
        { latitude: 9.9700, longitude: 76.3150 },
      ]
    },
    {
      id: 4, duration: '25 mins', distance: '6.8 km',
      startTime: '04:00 PM', endTime: '04:25 PM',
      date: new Date().toDateString(),
      coordinates: [
        { latitude: 9.9700, longitude: 76.3150 },
        { latitude: 9.9600, longitude: 76.3000 },
        { latitude: 9.9500, longitude: 76.2800 },
      ]
    },
    {
      id: 5, duration: '50 mins', distance: '15.2 km',
      startTime: '07:30 PM', endTime: '08:20 PM',
      date: new Date().toDateString(),
      coordinates: [
        { latitude: 9.9500, longitude: 76.2800 },
        { latitude: 9.9800, longitude: 76.3300 },
        { latitude: 10.0200, longitude: 76.3800 },
        { latitude: 10.0500, longitude: 76.4200 },
      ]
    },
    {
      id: 6, duration: '20 mins', distance: '5.1 km',
      startTime: '07:15 AM', endTime: '07:35 AM',
      date: new Date(new Date().setDate(new Date().getDate() - 1)).toDateString(), // Yesterday
      coordinates: [
        { latitude: 9.9312, longitude: 76.2673 },
        { latitude: 9.9400, longitude: 76.2700 },
        { latitude: 9.9500, longitude: 76.2800 },
      ]
    }
  ]);

  const filteredTrips = trips.filter(t => t.date === selectedDate);
  const currentTrip = filteredTrips.find(t => t.id === selectedTripId) || null;
  
  const getInterpolatedPos = (coords, progress) => {
    if (!coords || coords.length === 0) return null;
    const index = Math.floor(progress);
    const nextIndex = Math.min(index + 1, coords.length - 1);
    const factor = progress - index;

    if (index === nextIndex) return coords[index];

    const A = coords[index];
    const B = coords[nextIndex];

    return {
      latitude: A.latitude + (B.latitude - A.latitude) * factor,
      longitude: A.longitude + (B.longitude - A.longitude) * factor,
    };
  };

  const carPos = currentTrip ? getInterpolatedPos(currentTrip.coordinates, carProgress) : null;

  const handleScrubberUpdate = (p, trip, isBegin) => {
    const newProgress = p * (trip.coordinates.length - 1);
    setCarProgress(newProgress);
    const newPos = getInterpolatedPos(trip.coordinates, newProgress);
    
    // Eliminate lag by differentiating between Jumps and Drags
    if (isBegin) {
      // Smooth initial glide for jumps/taps
      mapRef.current?.animateCamera({ center: newPos }, { duration: 300 });
    } else {
      // Instant follow for zero-lag feeling during drag
      mapRef.current?.setCamera({ center: newPos });
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      {/* Native Android Date Picker Trigger */}
      {showPicker && (
        <DateTimePicker
          value={new Date(selectedDate)}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      {/* FIXED HEADER: PICKER & DATE */}
      <View style={{ padding: 20, paddingBottom: 10 }}>
        <View style={{ 
          flexDirection: 'row', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 15
        }}>
          <View>
            <Text style={{ 
              fontSize: 18, 
              color: themeColors.text, 
              fontWeight: 'bold', 
            }}>
              {new Date(selectedDate).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </Text>
            <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
              {new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long' })}
            </Text>
          </View>

          <Pressable 
            onPress={() => setShowPicker(true)}
            style={{ 
              backgroundColor: colorTheme + '20', 
              paddingHorizontal: 15, 
              paddingVertical: 8, 
              borderRadius: 12,
              flexDirection: 'row',
              alignItems: 'center'
            }}
          >
            <FontAwesome5 name="calendar-alt" size={14} color={colorTheme} style={{ marginRight: 8 }} />
            <Text style={{ color: colorTheme, fontWeight: '700', fontSize: 12 }}>Pick Date</Text>
          </Pressable>
        </View>
        
        <View style={{
          backgroundColor: themeColors.card,
          borderRadius: 24,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 4.65,
          aspectRatio: 1.2,
          borderWidth: 1,
          borderColor: themeColors.border,
          overflow: 'hidden',
          marginBottom: 10
        }}>
          <MemoizedTripMap 
            ref={mapRef}
            currentTrip={currentTrip} 
            carPos={carPos} 
            colorTheme={colorTheme} 
            selectedTripId={selectedTripId} 
          />
        </View>
      </View>

      {/* SCROLLABLE LIST: TRIPS */}
      <ScrollView 
        ref={listRef}
        style={{ flex: 1 }} 
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginTop: 5 }}>
          {filteredTrips.length > 0 ? (
            filteredTrips.map((trip, index) => (
              <MemoizedTripCard 
                key={trip.id}
                trip={trip}
                index={index}
                isSelected={selectedTripId === trip.id}
                onSelect={handleTripSelect}
                carProgress={carProgress}
                colorTheme={colorTheme}
                themeColors={themeColors}
                onScrubberInteraction={handleScrubberUpdate}
                onLayout={(e) => {
                  cardPositions.current[trip.id] = e.nativeEvent.layout.y;
                }}
              />
            ))
          ) : (
            <View style={{ 
              backgroundColor: themeColors.card, 
              padding: 24, 
              borderRadius: 24, 
              alignItems: 'center',
              borderWidth: 1,
              borderColor: themeColors.border,
              marginTop: 15
            }}>
              <FontAwesome5 name="calendar-times" size={32} color={themeColors.textSecondary} />
              <Text style={{ color: themeColors.text, fontSize: 16, fontWeight: 'bold', marginTop: 10 }}>No Journeys</Text>
              <Text style={{ color: themeColors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 5 }}>
                No travel data recorded for this date.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
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
        </View>

        <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>VEHICLE</Text>
        <View style={[styles.settingsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border, paddingVertical: 15 }]}>
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

  return (
    <Tab.Navigator screenOptions={{ animation: 'shift', headerShown: true }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <AntDesign name="home" size={24} color="black" />
          ),
          headerShown: false
        }} />
      <Tab.Screen
        name="My Data"
        component={DataScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <AntDesign name="database" size={24} color="black" />
          )
        }} />
      <Tab.Screen
        name="Travelogue"
        component={TravelogueScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <AntDesign name="book" size={24} color="black" />
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
        onPress={() => props.navigation.navigate('Main', { screen: 'TabsRoot' })}
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
    </DrawerContentScrollView>
  );
}

/* ------------------ Drawer ------------------ */

const Drawer = createDrawerNavigator();

export default function App({ navigation }) {

  useEffect(() => {
    const backAction = () => {
      if (navigation.canGoBack()) {
        return false;
      }

      Alert.alert(
        'Exit TravelSense',
        'Are you sure you want to exit?',
        [
          { text: 'Not really', style: 'cancel' },
          { text: 'Yes', onPress: () => BackHandler.exitApp() },
        ]
      );
      return true; // prevent default behavior
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SettingsProvider>
        <NavigationContainer>
          <Drawer.Navigator
            drawerContent={(props) => <CustomDrawerContent {...props} />}
            screenOptions={{
              headerShown: false,
              drawerType: "front",
              detachInactiveScreens: false,
              swipeEnabled: false,
            }}
          >
            <Drawer.Screen name="Main" component={DrawerStack}></Drawer.Screen>
          </Drawer.Navigator>
        </NavigationContainer>
      </SettingsProvider>
    </GestureHandlerRootView>
  )
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
    elevation: 5,
    textAlignVertical: "center",
  },
  searchContainer: {
    height: 50,
    backgroundColor: "white",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 25,
    overflow: "hidden",
    elevation: 5,
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
});