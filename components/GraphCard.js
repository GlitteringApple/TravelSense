import { View, Text, ScrollView } from "react-native";
import {
	Canvas,
	Path,
	Skia,
} from "@shopify/react-native-skia";
import React, { useMemo, useRef, useEffect } from "react";

const GRAPH_HEIGHT = 100;
const DATA_LENGTH = 500;
const GRAPH_WIDTH = DATA_LENGTH * 3;

const SENSOR_CONFIG = {
	accelerometer: { dims: 3, colors: ["#FF3B30", "#34C759", "#007AFF"] },
	gyroscope: { dims: 3, colors: ["#FF9500", "#AF52DE", "#32ADE6"] },
	magnetometer: { dims: 3, colors: ["#FFD60A", "#30D158", "#BF5AF2"] },
	barometer: { dims: 1, colors: ["#FF375F"] },
	gps: { dims: 2, colors: ["#0A84FF", "#FF9F0A"] },
};

export default function GraphCard({ title = "Text: ", sensor = "accelerometer", sensorState }) {
	const config = SENSOR_CONFIG[sensor] || SENSOR_CONFIG["accelerometer"];
	const scrollViewRef = useRef(null);

	// Get data directly from the passed-in sensorState history
	const data = sensorState.history[sensor];

	// Initial scroll to end
	useEffect(() => {
		if (scrollViewRef.current) {
			scrollViewRef.current.scrollToEnd({ animated: false });
		}
	}, []);

	// Create paths for each dimension using useMemo
	const paths = useMemo(() => {
		const result = [];
		for (let d = 0; d < config.dims; d++) {
			if (!data[d]) continue;
			const path = Skia.Path.Make();
			path.moveTo(0, GRAPH_HEIGHT - data[d][0]);
			data[d].forEach((y, i) => {
				path.lineTo(i * 3, GRAPH_HEIGHT - y);
			});
			result.push(path);
		}
		return result;
	}, [data, config.dims]);

	// Create gridlines once
	const gridPaths = useMemo(() => {
		const result = [];
		const gridColor = '#e0e0e0';
		const gridStroke = 1;
		const numVertical = Math.floor(GRAPH_WIDTH / 50);
		const numHorizontal = 5;

		for (let i = 0; i <= numVertical; i++) {
			const x = i * 50;
			const gridPath = Skia.Path.Make();
			gridPath.moveTo(x, 0);
			gridPath.lineTo(x, GRAPH_HEIGHT);
			result.push(<Path key={`v-${i}`} path={gridPath} color={gridColor} strokeWidth={gridStroke} style="stroke" />);
		}

		for (let i = 0; i <= numHorizontal; i++) {
			const y = i * (GRAPH_HEIGHT / numHorizontal);
			const gridPath = Skia.Path.Make();
			gridPath.moveTo(0, y);
			gridPath.lineTo(GRAPH_WIDTH, y);
			result.push(<Path key={`h-${i}`} path={gridPath} color={gridColor} strokeWidth={gridStroke} style="stroke" />);
		}
		return result;
	}, []);

	return (
		<View style={{ padding: 25 / 2, backgroundColor: "white", borderRadius: 25, height: 100, overflow: "hidden", marginBottom: 15, flexDirection: "row" }}>
			<Text style={{ fontWeight: "bold", fontSize: 40, textAlignVertical: "center", width: 100, flexDirection: "row" }}>{title}</Text>
			<View style={{ backgroundColor: "lightgray", flex: 1 }}>
				<View style={{ backgroundColor: "#ffffff", justifyContent: "center" }}>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={true}
						ref={scrollViewRef}
					>
						<Canvas style={{ width: GRAPH_WIDTH, height: GRAPH_HEIGHT }}>
							{gridPaths}
							{paths.map((p, i) => (
								<Path key={i} path={p} color={config.colors[i]} strokeWidth={2} style="stroke" />
							))}
						</Canvas>
					</ScrollView>
				</View>
			</View>
		</View>
	);
}