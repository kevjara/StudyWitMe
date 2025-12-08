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
  orderBy,
} from "firebase/firestore";
import ImagePicker from "./ImagePicker";
import ModalPortal from "./ModalPortal";
import {categories} from "./categories"; 
import styles from "./ManageDeck.module.css";

export default function ManageDeck() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [justAddedCard, setJustAddedCard] = useState(false);
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
  const [editSubcategory, setEditSubcategory] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [deckIsDirty, setDeckIsDirty] = useState(false);
  const [deckSaving, setDeckSaving] = useState(false);
  const [pickerForCard, setPickerForCard] = useState(null);
  const [pickerForDeck, setPickerForDeck] = useState(false);
  const [editImageUrl, setEditImageUrl] = useState(deck?.imageUrl || null);

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
      setEditSubcategory(deck.subcategory || "");
      setEditIsPublic(deck.isPublic || false);
      setEditImageUrl(deck.imageUrl || null);
      setDeckIsDirty(false); // Reset dirty status on initial load/deck change
    }
  }, [deck]);
  useEffect(() => {
    if (!deck) return;
    const isDirty =
      editTitle !== deck.title ||
      editDescription !== deck.description ||
      editCategory !== deck.category ||
      editIsPublic !== deck.isPublic ||
      (deck.imageUrl || null) !== (editImageUrl || null);
    setDeckIsDirty(isDirty);
  }, [editTitle, editDescription, editCategory, editIsPublic, deck]);

  useEffect(() => {
    if (!currentUser || !deckId) return;
    setLoading(true);

    // Load deck once
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

    // Live listen to cards
    const cref = collection(db, "flashcard");
    const qCards = query(
      cref,
      where("deckId", "==", deckId),
      where("ownerId", "==", currentUser.uid),
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
        const sortedList = list.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return aTime - bTime; // ascending order
        });
        setCards(sortedList);
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

  useEffect(() => {
    if (justAddedCard && cards.length > 0) {
      setCurrentIndex(cards.length - 1); // jump to last card
      setJustAddedCard(false);
    }
  }, [cards, justAddedCard]);

  // Reset index safely when cards change
  useEffect(() => {
    if (cards.length === 0) {
      setCurrentIndex(0);
    } else if (currentIndex >= cards.length) {
      // if the last card was deleted, move to the new last index
      setCurrentIndex(cards.length - 1);
    }
  }, [cards, currentIndex]);

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
        imageUrl: editImageUrl,
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

    const deletedIndex = cards.findIndex(c => c.id === id);

    try {
      // adjust currentIndex
      setCurrentIndex((prev) => {
        if (cards.length <= 1) return 0; 
        if (deletedIndex < prev) return prev - 1; 
        if (deletedIndex === prev && prev === cards.length - 1) return prev - 1;
        return prev; 
      });
        await deleteDoc(doc(db, "flashcard", id));
        toast("Card deleted");
    } catch (e) {
      console.error(e);
      toast("Failed to delete card");
    }
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
    setJustAddedCard(true);
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
          <div className={styles.loadingToolbar}>
              <h1 className={styles.loadingTitle}>Loading Deck...</h1>
          </div>
      </div>
    );

  return (
    <div className={styles.overlay}>
        <div className={styles.stickyToolbar}>
          <button className={styles.backButton} onClick={() => navigate("/flashcards")}>
              ← Back
          </button>
          <div className={styles.deckToolbar}>
          <div className={styles.toolbarLeft}>
          </div>
          <h2 className={styles.toolbarTitle}>Manage Deck</h2>
        </div>
        </div>
      <div className={styles.menuBackdrop}>
      
      <div className={styles.header}><h2>Deck Cover</h2></div>
        
      {/* DECK EDITING FORM */}
      <div className={styles.coverCard}>
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
          className={`${styles.deckCard} ${styles.textArea}`}
        />

        {/* Category and Public Status */}
        <div className={styles.categoryRow}>
          <div className={styles.categoryColumn}>
            <label>Category</label>
            <select
              className={styles.dropdown}
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
            >
              <option value="">--Select Category--</option>
              {categories.map((cat) => (
                <option key={cat.name} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>

            {/* Subcategory dropdown */}
            <label className={styles.subcategoryLabel}>Subcategory</label>
            <select
              className={styles.dropdown}
              value={editSubcategory}
              onChange={(e) => setEditSubcategory(e.target.value)}
              disabled={!editCategory} // disable if no category selected
            >
              <option value="">--Select Subcategory--</option>
              {categories
                .find((cat) => cat.name === editCategory)
                ?.subcategories?.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
            </select>
          </div>

          <div className={styles.publicToggle}>
            <input
              type="checkbox"
              id="isPublicCheck"
              checked={editIsPublic}
              onChange={(e) => setEditIsPublic(e.target.checked)}
            />
            <label htmlFor="isPublicCheck" className={styles.publicLabel}>
              Make Deck Public
            </label>
          </div>
        </div>

        {/* Image */}
        <div className={styles.imageRow}>
          <div className={styles.imageBox}>
            {editImageUrl ? (
              <img
                src={editImageUrl}
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
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            className={styles.deckButtonSmall}
            onClick={() => {
              setPickerForDeck(true);
              setDeckIsDirty(true);
            }}
          >
            {editImageUrl ? "Change Deck Image" : "Add Deck Image"}
          </button>
          {editImageUrl && (
            <button
              className={styles.deckButtonSmall}
              onClick={() => {
                setEditImageUrl(null);
                setDeckIsDirty(true); 
              }}
            >
              Remove
            </button>
          )}
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSaveDeckInfo}
          disabled={!deckIsDirty || deckSaving}
          className={styles.saveButton}
        >
          {deckSaving ? "Saving Deck Info..." : deckIsDirty ? "Save Deck Info" : "Deck Info Saved"}
        </button>
      </div>
      {/* END DECK EDITING FORM */}

      <h2>Flashcards</h2>

      {/* Flashcard Viewer */}
      <div className={styles.flashcardViewerWrapper} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        
        {/* Left: Flashcard + Navigation */}
        <div className={styles.flashcardColumn}>
          {cards.length > 0 && (
            <>
            <div className={styles.flashcard}>
              {/* Image */}
              <div className={styles.imageRow}>
                <div className={styles.imageBox}>
                  {cards[currentIndex]._imagePath ? (
                    <img
                      src={cards[currentIndex]._imagePath}
                      alt=""
                      className={styles.cardImage}
                    />
                  ) : (
                    <div className={styles.noImage}>No image</div>
                  )}
                </div>
                <div className={styles.imageButtons}>
                  <button
                    className={styles.deckButtonSmall}
                    onClick={() => setPickerForCard(cards[currentIndex].id)}
                  >
                    {cards[currentIndex]._imagePath ? "Change Image" : "Add Image"}
                  </button>
                  {cards[currentIndex]._imagePath && (
                    <button
                      className={styles.deckButtonSmall}
                      onClick={() =>
                        handleFieldEdit(cards[currentIndex].id, "_imagePath", null)
                      }
                    >
                      Remove Image
                    </button>
                  )}
                </div>
              </div>

              {/* Type Dropdown */}
              <div className={styles.typeRow}>
                <label className={styles.typeLabel}>Type</label>
                <select
                  className={styles.dropdown}
                  value={cards[currentIndex]._type}
                  onChange={(e) =>
                    handleFieldEdit(cards[currentIndex].id, "_type", e.target.value)
                  }
                >
                  <option value="Short Response">Short Response</option>
                  <option value="Multiple Choice">Multiple Choice</option>
                </select>
              </div>

              {/* Front Textarea */}
              <div className={styles.textAreaRow}>
                <label className={styles.textAreaLabel}>Front</label>
                <textarea
                  value={cards[currentIndex]._front}
                  onChange={(e) =>
                    handleFieldEdit(cards[currentIndex].id, "_front", e.target.value)
                  }
                  className={styles.textArea}
                />
              </div>

              {/* Back Textarea */}
              <div className={styles.textAreaRow}>
                <label className={styles.textAreaLabel}>Back</label>
                <textarea
                  value={cards[currentIndex]._back}
                  onChange={(e) =>
                    handleFieldEdit(cards[currentIndex].id, "_back", e.target.value)
                  }
                  className={styles.textArea}
                />
              </div>

              <div className={styles.deckButtons}>
                <button
                  disabled={!cards[currentIndex]._dirty || cards[currentIndex]._saving}
                  onClick={() => handleSave(cards[currentIndex].id)}
                >
                  {cards[currentIndex]._saving
                    ? "Saving…"
                    : cards[currentIndex]._dirty
                    ? "Save"
                    : "Saved"}
                </button>
                <button onClick={() => handleDelete(cards[currentIndex].id)}>
                  Delete
                </button>
              </div>
            </div>

            {/* Navigation */}
            <div className={styles.navButtons}>
              <button
                className={styles.navButton}
                onClick={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
                disabled={currentIndex === 0}
              >
                ← Previous
              </button>
              <span>
                {currentIndex + 1} / {cards.length}
              </span>
              <button
                className={styles.navButton}
                onClick={() => setCurrentIndex((prev) => Math.min(prev + 1, cards.length - 1))}
                disabled={currentIndex === cards.length - 1}
              >
                Next →
              </button>
            </div>
          </>
        )}

        {cards.length === 0 && (
          <div className={styles.emptyDeckMessage}>
            <p>This deck is empty!</p>
          </div>
        )}
      </div>

      {/* Right: Add Card button */}
      <div className={styles.addCardColumn}>
       <button
          onClick={handleAddCard}
          className={styles.addCardButton}
          disabled={cards.length >= 100} // disable when 100 or more
        >
          {cards.length >= 100 ? "Flashcards limit reached" : "+ Add Card"}
        </button>
      </div>
    </div>

    <div className={styles.addCardColumn}>
      <button
        onClick={handleAddCard}
        className={styles.addCardButton}
        disabled={cards.length >= 100} // disable when 100 or more
      >
        {cards.length >= 100 ? "Flashcards limit reached" : "+ Add Card"}
      </button>
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
                      setEditImageUrl(img?.webformatURL || null); // track locally
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