import {Pressable, StyleSheet} from "react-native";

export default function ButtonRound({onPress, children}) {
    return (
    <Pressable onPress={onPress} style={buttonStyles.circle}>
            {children}  
        </Pressable>
    )
}
const buttonStyles = StyleSheet.create({
    circle: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: "#ffffff",
        justifyContent: "center",
        alignItems: "center",
        elevation: 5,
    },
});