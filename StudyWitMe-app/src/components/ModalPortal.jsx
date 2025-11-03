import { createPortal } from "react-dom";

//this is just to help with managedeck for editing the decks, check further if not needed
export default function ModalPortal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
