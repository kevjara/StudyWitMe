import Header from "./Header";
import { Outlet } from "react-router-dom";

export default function Layout({ handleSignOut }) {
    return (
        <>
        <Header handleSignOut={handleSignOut} />
        <Outlet /> {/* child routes render here */}
        </>
    );
}
