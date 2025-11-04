// utils/navigation.js
export const handleBack = (navigate, fallback = "/") => {
    if (window.history.state && window.history.state.idx > 0) {
        navigate(-1);
    } else {
        navigate(fallback);
    }
};
