import DefaultProfileIcon from "../assets/profile_icons/Default_Profile_Icon.png";
import GuestProfileIcon from "../assets/profile_icons/Guest_Profile_Icon.png";
import "./Avatar.css";

// Centralized avatar registry
export const AVATARS = {
    default: DefaultProfileIcon,
    guest: GuestProfileIcon,
};

/**
* Avatar component
* @param {string} type - avatar key (e.g. 'default', 'guest')
* @param {string} alt - alt text for image
* @param {string} className - optional css class
*/
export default function Avatar({ avatar = "default", size = 32 }) {
    const src = AVATARS[avatar] || AVATARS.default;

    return (
        <div
            className="avatar-container"
            style={{
                width: size,
                height: size,
                minWidth: size,
                minHeight: size
            }}
        >
            <img
                src={src}
                alt="Avatar"
                className="avatar-image"
                draggable={false}
            />
        </div>
    );
}