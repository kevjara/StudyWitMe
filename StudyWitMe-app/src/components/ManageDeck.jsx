import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import styles from "./Flashcards.module.css";
import ImagePicker from "./ImagePicker";
import ModalPortal from "./ModalPortal";
import {categories} from "./categories"; 

export default function ManageDeck() {
  const { deckId } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [deck, setDeck] = useState(null);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const timeoutRef = useRef(null);
  const toast = (msg, ms = 2200) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setStatus(msg);
    timeoutRef.current = setTimeout(() => setStatus(""), ms);
  };

  //this is the top stuff for deck editing
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [deckIsDirty, setDeckIsDirty] = useState(false);
  const [deckSaving, setDeckSaving] = useState(false);
  const [pickerForCard, setPickerForCard] = useState(null);
  const [pickerForDeck, setPickerForDeck] = useState(false);

  //this locks the scroll when the image modal is open like in the gen
  useEffect(() => {
    const open = Boolean(pickerForCard || pickerForDeck);
    document.body.style.overflow = open ? "hidden" : "";
    return () => (document.body.style.overflow = "");
  }, [pickerForCard, pickerForDeck]);

  //This is to set the changes
  useEffect(() => {
    if (deck) {
      setEditTitle(deck.title || "");
      setEditDescription(deck.description || "");
      setEditCategory(deck.category || "");
      setEditIsPublic(deck.isPublic || false);
      setDeckIsDirty(false); // Reset dirty status on initial load/deck change
    }
  }, [deck]);
  useEffect(() => {
    if (!deck) return;
    const isDirty =
      editTitle !== deck.title ||
      editDescription !== deck.description ||
      editCategory !== deck.category ||
      editIsPublic !== deck.isPublic;
    setDeckIsDirty(isDirty);
  }, [editTitle, editDescription, editCategory, editIsPublic, deck]);

  useEffect(() => {
    if (!currentUser || !deckId) return;
    setLoading(true);

    //this is for the deck load
    (async () => {
      try {
        const dref = doc(db, "deck", deckId);
        const snap = await getDoc(dref);
        if (snap.exists()) setDeck({ id: snap.id, ...snap.data() });
        else toast("Deck not found");
      } catch {
        toast("Failed to load deck");
      }
    })();
    const cref = collection(db, "flashcard");
    const qCards = query(
      cref,
      where("deckId", "==", deckId),
      where("ownerId", "==", currentUser.uid)
    );
    const unsub = onSnapshot(
      qCards,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          _front: d.data().front || "",
          _back: d.data().back || "",
          _type: d.data().type || "Multiple Choice",
          _imagePath: d.data().imagePath || null,
          _dirty: false,
          _saving: false,
        }));
        setCards(list);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast("Missing or insufficient permissions.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser, deckId]);

  //this is to handle the edits to db
  const handleSaveDeckInfo = async () => {
    if (!deckIsDirty) return;
    setDeckSaving(true);
    try {
      const newDeckData = {
        title: editTitle,
        description: editDescription,
        category: editCategory,
        isPublic: editIsPublic,
      };

      await updateDoc(doc(db, "deck", deckId), newDeckData);
      setDeck((d) => ({ ...d, ...newDeckData }));

      toast("Deck info saved ✓");
    } catch (e) {
      console.error(e);
      toast("Failed to save deck info");
    } finally {
      setDeckSaving(false);
    }
  };

  const handleFieldEdit = (id, key, value) =>
    setCards((p) =>
      p.map((c) => (c.id === id ? { ...c, [key]: value, _dirty: true } : c))
    );

  const handleSave = async (id) => {
    try {
      setCards((p) => p.map((c) => (c.id === id ? { ...c, _saving: true } : c)));
      const card = cards.find((c) => c.id === id);
      await updateDoc(doc(db, "flashcard", id), {
        front: card._front,
        back: card._back,
        type: card._type,
        imagePath: card._imagePath,
        category: card.category ?? editCategory, //need to add category, so by default cards will use deck category
      });
      toast("Card Saved ✓");
      setCards((p) =>
        p.map((c) =>
          c.id === id ? { ...c, _saving: false, _dirty: false } : c
        )
      );
    } catch (e) {
      console.error(e);
      toast("Card Save failed");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this card?")) return;
    await deleteDoc(doc(db, "flashcard", id));
    toast("Card deleted");
  };

  const handleAddCard = async () => {
    await addDoc(collection(db, "flashcard"), {
      deckId,
      ownerId: currentUser.uid,
      front: "",
      back: "",
      type: "Multiple Choice",
      imagePath: null,
      category: deck?.category || "",
      createdAt: serverTimestamp(),
      isPublic: false,
    });
    toast("Added new card");
  };
  if (!currentUser)
    return (
      <div className={styles.overlay}>
        <div className={styles.menuBackdrop}>
          <h2>Not signed in</h2>
          <Link to="/login">Login</Link>
        </div>
      </div>
    );

  if (loading || !deck)
    return (
      <div className={styles.overlay}>
        <div className={styles.menuBackdrop}>
          <h2>Loading deck…</h2>
        </div>
      </div>
    );

  return (
    <div className={styles.overlay}>
      <div className={styles.menuBackdrop}>
        <button className={styles.stickyBackButton} onClick={() => navigate(-1)}>
          ← Back
        </button>

        <h2>Manage Deck: {deck?.title || "Untitled Deck"}</h2>
        
        {/* DECK EDITING FORM */}
        <div style={{ maxWidth: 800, width: "100%", padding: "16px 0", borderBottom: "1px solid #e5e7eb", marginBottom: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          
          {/* Title and Description */}
          <label>Title</label>
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className={styles.dropdown}
          />

          <label>Description</label>
          <textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            className={styles.deckCard}
            style={{ minHeight: "80px", padding: "8px" }}
          />

          {/* Category and Public Status */}
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <label>Category</label>
              <select
                className={styles.dropdown}
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
              >
                {/* Fallback option */}
                <option value="">Select Category</option>
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto" }}>
              <input
                type="checkbox"
                id="isPublicCheck"
                checked={editIsPublic}
                onChange={(e) => setEditIsPublic(e.target.checked)}
              />
              <label htmlFor="isPublicCheck" style={{ fontWeight: 500, fontSize: "0.9rem" }}>
                Make Deck Public
              </label>
            </div>
          </div>
          
          {/* Save Button */}
          <button
            onClick={handleSaveDeckInfo}
            disabled={!deckIsDirty || deckSaving}
            style={{ width: "fit-content", alignSelf: "flex-end", marginTop: 16 }}
            className={styles.toolbarLeft} 
          >
            {deckSaving ? "Saving Deck Info..." : deckIsDirty ? "Save Deck Info" : "Deck Info Saved"}
          </button>
        </div>
        {/* END DECK EDITING FORM */}


        {/* deck Image controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 10,
              overflow: "hidden",
              border: "1px solid #e5e7eb",
              background: "#f8fafc",
            }}
          >
            {deck?.imageUrl ? (
              <img
                src={deck.imageUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                  height: "100%",
                  fontSize: 12,
                  color: "#64748b",
                }}
              >
                No image
              </div>
            )}
          </div>
          <button
            className={styles.deckButtonSmall}
            onClick={() => setPickerForDeck(true)}
          >
            {deck?.imageUrl ? "Change Deck Image" : "Add Deck Image"}
          </button>
          {deck?.imageUrl && (
            <button
              className={styles.deckButtonSmall}
              onClick={async () => {
                await updateDoc(doc(db, "deck", deckId), { imageUrl: null });
                setDeck((d) => ({ ...d, imageUrl: null }));
                toast("Removed deck image");
              }}
            >
              Remove
            </button>
          )}
        </div>
        <div className={styles.deckToolbar}>
          <button onClick={handleAddCard}>+ Add Card</button>
          {status && <span className={styles.statusPill}>{status}</span>}
        </div>

        {/*Flashcards (Card Editing)*/}
        <div 
            className={styles.categoryGrid}
            //fixed bug, CSS fix here
            style={{ 
                maxWidth: '1000px', 
                margin: '0 auto', 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', // Use a larger min-width for columns
                gap: '24px' // Increased gap for visual separation
            }}
        >
          {cards.map((c) => (
            <div 
              key={c.id} 
              className={styles.deckCard}
              style={{ 
                minHeight: '420px', 
                height: 'auto', 
                maxWidth: '100%', 
                display: 'flex', 
                flexDirection: 'column',
                gap: '12px',
                padding: '20px', 
                boxSizing: 'border-box'
              }}
            >
              
              {/* Image */}
              <div style={{ display: "flex", gap: 12 }}>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "#f3f4f6",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  {c._imagePath ? (
                    <img
                      src={c._imagePath}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        placeItems: "center",
                        height: "100%",
                        fontSize: 12,
                        color: "#374151",
                      }}
                    >
                      No image
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button
                    className={styles.deckButtonSmall}
                    onClick={() => setPickerForCard(c.id)}
                  >
                    {c._imagePath ? "Change Image" : "Add Image"}
                  </button>
                  {c._imagePath && (
                    <button
                      className={styles.deckButtonSmall}
                      onClick={() => handleFieldEdit(c.id, "_imagePath", null)}
                    >
                      Remove Image
                    </button>
                  )}
                </div>
              </div>

              {/* Type Dropdown */}
              <div style={{ marginTop: 10 }}>
                <label style={{ fontWeight: '600' }}>Type</label>
                <select
                  className={styles.dropdown}
                  value={c._type}
                  onChange={(e) => handleFieldEdit(c.id, "_type", e.target.value)}
                  style={{ marginTop: '4px' }}
                >
                  <option value="Short Response">Short Response</option>
                  <option value="Multiple Choice">Multiple Choice</option>
                </select>
              </div>

              {/* Front Textarea */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ fontWeight: '600' }}>Front</label>
                <textarea
                  value={c._front}
                  onChange={(e) => handleFieldEdit(c.id, "_front", e.target.value)}
                  style={{ minHeight: '100px', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px', resize: 'vertical' }}
                />
              </div>
              
              {/* Back Textarea */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ fontWeight: '600' }}>Back</label>
                <textarea
                  value={c._back}
                  onChange={(e) => handleFieldEdit(c.id, "_back", e.target.value)}
                  style={{ minHeight: '100px', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px', resize: 'vertical' }}
                />
              </div>


              {/* Info strip */}
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                <div>ID: {c.id}</div>
                <div>Deck: {c.deckId}</div>
                <div>Owner: {c.ownerId}</div>
              </div>

              <div className={styles.deckButtons}>
                <button
                  disabled={!c._dirty || c._saving}
                  onClick={() => handleSave(c.id)}
                >
                  {c._saving ? "Saving…" : c._dirty ? "Save" : "Saved"}
                </button>
                <button onClick={() => handleDelete(c.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>

        {/* Deck Image Picker Modal (Unchanged) */}
        {pickerForDeck && (
          <ModalPortal>
            <div className={styles.pickerOverlay}>
              <div className={styles.pickerDialog}>
                <div className={styles.pickerHeader}>
                  <span>Choose Deck Image</span>
                  <button onClick={() => setPickerForDeck(false)}>Close</button>
                </div>
                <div className={styles.pickerBody}>
                  <ImagePicker
                    mode="inline"
                    open
                    onClose={() => setPickerForDeck(false)}
                    onSelect={async (img) => {
                      const url = img?.webformatURL || null;
                      await updateDoc(doc(db, "deck", deckId), { imageUrl: url, imageAttribution: img ? { pageURL: img.pageURL, user: img.user } : null });
                      setDeck((d) => ({ ...d, imageUrl: url }));
                      toast("Deck image updated ✓");
                      setPickerForDeck(false);
                    }}
                  />
                </div>
              </div>
            </div>
          </ModalPortal>
        )}

        {/* Card Image Picker Modal (Unchanged) */}
        {pickerForCard && (
          <ModalPortal>
            <div className={styles.pickerOverlay}>
              <div className={styles.pickerDialog}>
                <div className={styles.pickerHeader}>
                  <span>Select Image</span>
                  <button onClick={() => setPickerForCard(null)}>Close</button>
                </div>
                <div className={styles.pickerBody}>
                  <ImagePicker
                    mode="inline"
                    open
                    onClose={() => setPickerForCard(null)}
                    onSelect={(img) => {
                      handleFieldEdit(
                        pickerForCard,
                        "_imagePath",
                        img?.webformatURL || null
                      );
                      setPickerForCard(null);
                    }}
                  />
                </div>
              </div>
            </div>
          </ModalPortal>
        )}
      </div>
    </div>
  );
}