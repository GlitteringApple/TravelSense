import { View, Text, ScrollView, Dimensions } from "react-native";
import {
	Canvas,
	Path,
	Skia,
	Paint,
} from "@shopify/react-native-skia";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";

import { useSensorData } from '../src/sensors/Sensor';

const { width: screenWidth } = Dimensions.get('window');

const DATA_LENGTH = 500;
const GRAPH_HEIGHT = 100;
const GRAPH_WIDTH = DATA_LENGTH * 3; // Make graph wider for scrolling

const SENSOR_CONFIG = {
	accelerometer: { label: 'Accelerometer', dims: 3, colors: ["#FF3B30", "#34C759", "#007AFF"] },
	gyroscope: { label: 'Gyroscope', dims: 3, colors: ["#FF9500", "#AF52DE", "#32ADE6"] },
	magnetometer: { label: 'Magnetometer', dims: 3, colors: ["#FFD60A", "#30D158", "#BF5AF2"] },
	barometer: { label: 'Barometer', dims: 1, colors: ["#FF375F"] },
	gps: { label: 'GPS', dims: 2, colors: ["#0A84FF", "#FF9F0A"] },
};



export default function GraphCard({ title = "Text: ", sensor = "accelerometer" }) {
	const config = SENSOR_CONFIG[sensor] || SENSOR_CONFIG["accelerometer"];
	const scrollViewRef = useRef(null);
	const sensorData = useSensorData();
	const [data, setData] = useState(Array(config.dims).fill().map(() => Array(DATA_LENGTH).fill(0)));

	useEffect(() => {
		// Map sensorData to graph values
		let values = [];
		if (sensor === "accelerometer") {
			values = [
				((sensorData.accelerometer.x + 2) / 4) * GRAPH_HEIGHT,
				((sensorData.accelerometer.y + 2) / 4) * GRAPH_HEIGHT,
				((sensorData.accelerometer.z + 2) / 4) * GRAPH_HEIGHT,
			];
		} else if (sensor === "gyroscope") {
			values = [
				((sensorData.gyroscope.x + 8) / 16) * GRAPH_HEIGHT,
				((sensorData.gyroscope.y + 8) / 16) * GRAPH_HEIGHT,
				((sensorData.gyroscope.z + 8) / 16) * GRAPH_HEIGHT,
			];
		} else if (sensor === "magnetometer") {
			values = [
				((sensorData.magnetometer.x + 100) / 200) * GRAPH_HEIGHT,
				((sensorData.magnetometer.y + 100) / 200) * GRAPH_HEIGHT,
				((sensorData.magnetometer.z + 100) / 200) * GRAPH_HEIGHT,
			];
		} else if (sensor === "barometer") {
			values = [
				(sensorData.barometer.pressure / 1100) * GRAPH_HEIGHT
			];
		} else if (sensor === "gps") {
			values = [
				((sensorData.gps.latitude + 90) / 180) * GRAPH_HEIGHT,
				((sensorData.gps.longitude + 180) / 360) * GRAPH_HEIGHT,
			];
		}
		setData(prev => prev.map((arr, i) => {
			const newArr = arr.slice(1);
			newArr.push(values[i] ?? 0);
			return newArr;
		}));
	}, [sensorData, sensor]);

	// Create paths for each dimension
	const paths = [];
	for (let d = 0; d < config.dims; d++) {
		const path = Skia.Path.Make();
		path.moveTo(0, GRAPH_HEIGHT - data[d][0]);
		data[d].forEach((y, i) => {
			path.lineTo(i * 3, GRAPH_HEIGHT - y);
		});
		paths.push(path);
	}

	// Create gridlines
	const gridPaths = [];
	const gridColor = '#e0e0e0';
	const gridStroke = 1;
	const numVertical = Math.floor(GRAPH_WIDTH / 50);
	const numHorizontal = 5;

	// Vertical gridlines
	for (let i = 0; i <= numVertical; i++) {
		const x = i * 50;
		const gridPath = Skia.Path.Make();
		gridPath.moveTo(x, 0);
		gridPath.lineTo(x, GRAPH_HEIGHT);
		gridPaths.push(
			<Path key={`v-${i}`} path={gridPath} color={gridColor} strokeWidth={gridStroke} style="stroke" />
		);
	}

	// Horizontal gridlines
	for (let i = 0; i <= numHorizontal; i++) {
		const y = i * (GRAPH_HEIGHT / numHorizontal);
		const gridPath = Skia.Path.Make();
		gridPath.moveTo(0, y);
		gridPath.lineTo(GRAPH_WIDTH, y);
		gridPaths.push(
			<Path key={`h-${i}`} path={gridPath} color={gridColor} strokeWidth={gridStroke} style="stroke" />
		);
	}

	return (
		<View style={{ padding: 25 / 2, backgroundColor: "white", borderRadius: 25, height: 100, overflow: "hidden", marginBottom: 15, flexDirection: "row" }}>
			<Text style={{ fontWeight: "bold", fontSize: 40, textAlignVertical: "center", width: 100, flexDirection: "row" }}>{title}</Text>
			<View style={{ backgroundColor: "lightgray", flex: 1 }}>
				<View style={{ backgroundColor: "#ffffff", justifyContent: "center" }}>
					<ScrollView horizontal showsHorizontalScrollIndicator={true}>
						<ScrollView
							horizontal
							showsHorizontalScrollIndicator={true}
							ref={scrollViewRef}
							onContentSizeChange={() => {
								if (scrollViewRef.current) {
									scrollViewRef.current.scrollToEnd({ animated: false });
								}
							}}
						>
							<Canvas style={{ width: GRAPH_WIDTH, height: GRAPH_HEIGHT }}>
								{gridPaths}
								{paths.map((p, i) => (
									<Path key={i} path={p} color={config.colors[i]} strokeWidth={2} style="stroke" />
								))}
							</Canvas>
						</ScrollView>
					</ScrollView>
				</View>
			</View>
		</View>
	);
}