import {Pressable, StyleSheet} from "react-native";

export default function ButtonRound({onPress, children, size = 50}) {
    return (
    <Pressable onPress={onPress} style={[buttonStyles.circle, {width: size, height: size, borderRadius: size/2}]}>
            {children}  
        </Pressable>
    )
}
const buttonStyles = StyleSheet.create({
    circle: {
        backgroundColor: "#ffffff",
        justifyContent: "center",
        alignItems: "center",
        elevation: 5,
    },
});