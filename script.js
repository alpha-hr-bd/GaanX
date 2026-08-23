import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

import {
  firebaseConfig
} from "./firebase-config.js";


/* =====================================================
   FIREBASE
===================================================== */

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

const storage = getStorage(app);


/* =====================================================
   STATE
===================================================== */

let songs = [];

let playlists = [];

let currentSongIndex = -1;

let shuffleEnabled = false;

let repeatMode = "off";

let currentUser = null;


/* =====================================================
   LOCAL STORAGE
===================================================== */

let likedSongs =
  JSON.parse(localStorage.getItem("gaanxLiked")) || [];

let recentlyPlayed =
  JSON.parse(localStorage.getItem("gaanxRecent")) || [];


/* =====================================================
   DOM
===================================================== */

const audio = document.getElementById("audio");

const homeSongs =
  document.getElementById("homeSongs");

const searchSongsContainer =
  document.getElementById("searchSongs");

const likedSongsContainer =
  document.getElementById("likedSongs");

const recentSongsContainer =
  document.getElementById("recentSongs");

const playlistGrid =
  document.getElementById("playlistGrid");

const searchInput =
  document.getElementById("searchInput");


/* =====================================================
   DEFAULT COVER
===================================================== */

const DEFAULT_COVER =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg"
         width="600"
         height="600"
         viewBox="0 0 600 600">
      <rect width="600" height="600" fill="#181818"/>
      <text x="300"
            y="330"
            text-anchor="middle"
            font-size="180"
            fill="#1ed760">G</text>
    </svg>
  `);


/* =====================================================
   LOAD FIRESTORE DATA
===================================================== */

async function loadSongs() {

  try {

    const q = query(
      collection(db, "songs"),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);

    songs = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    renderAll();

  } catch (error) {

    console.error(error);

    showToast("Could not load songs.");

  }

}


async function loadPlaylists() {

  try {

    const snapshot =
      await getDocs(collection(db, "playlists"));

    playlists = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    renderPlaylists();

    renderAdminPlaylistOptions();

  } catch (error) {

    console.error(error);

  }

}


/* =====================================================
   RENDER
===================================================== */

function renderAll() {

  renderSongs(songs, homeSongs);

  renderLiked();

  renderRecent();

}


function renderSongs(list, container) {

  if (!list.length) {

    container.innerHTML = `
      <div class="empty-state">
        <div>🎵</div>
        <p>No songs found.</p>
      </div>
    `;

    return;

  }


  container.innerHTML = list.map(song => {

    const liked =
      likedSongs.includes(song.id);

    return `

      <article class="song-card">

        <button
          class="like-button"
          data-like="${song.id}"
        >
          ${liked ? "♥" : "♡"}
        </button>

        <div class="cover-wrapper">

          <img
            class="song-cover"
            src="${escapeHTML(song.coverURL || DEFAULT_COVER)}"
            alt="${escapeHTML(song.title || "Song")}"
            loading="lazy"
          >

          <button
            class="card-play"
            data-play="${song.id}"
          >
            ▶
          </button>

        </div>

        <div class="song-title">
          ${escapeHTML(song.title || "Untitled")}
        </div>

        <div class="song-artist">
          ${escapeHTML(song.artist || "Unknown Artist")}
        </div>

      </article>
    `;

  }).join("");

}


function renderLiked() {

  const list =
    songs.filter(song =>
      likedSongs.includes(song.id)
    );

  renderSongs(
    list,
    likedSongsContainer
  );

}


function renderRecent() {

  const list =
    recentlyPlayed
      .map(id =>
        songs.find(song => song.id === id)
      )
      .filter(Boolean);

  renderSongs(
    list,
    recentSongsContainer
  );

}


/* =====================================================
   PLAYLISTS
===================================================== */

function renderPlaylists() {

  if (!playlists.length) {

    playlistGrid.innerHTML = `
      <div class="empty-state">
        <div>♫</div>
        <p>No playlists yet.</p>
      </div>
    `;

    return;

  }


  playlistGrid.innerHTML =
    playlists.map(playlist => `

      <article
        class="playlist-card"
        data-playlist="${playlist.id}"
      >

        <div class="playlist-icon">
          ♫
        </div>

        <h3>
          ${escapeHTML(playlist.name)}
        </h3>

        <p>
          ${(playlist.songIds || []).length} songs
        </p>

      </article>

    `).join("");

}


async function createPlaylist() {

  if (!currentUser) {

    openModal("adminLoginModal");

    showToast("Sign in required for this demo.");

    return;

  }

  const name =
    document
      .getElementById("playlistNameInput")
      .value
      .trim();

  if (!name) {

    showToast("Enter a playlist name.");

    return;

  }

  try {

    await addDoc(
      collection(db, "playlists"),
      {
        name,
        songIds: [],
        createdAt: serverTimestamp()
      }
    );

    document
      .getElementById("playlistNameInput")
      .value = "";

    closeModal("playlistModal");

    await loadPlaylists();

    showToast("Playlist created.");

  } catch (error) {

    console.error(error);

    showToast("Could not create playlist.");

  }

}


/* =====================================================
   PLAYLIST SONGS
===================================================== */

async function openPlaylist(playlistId) {

  const playlist =
    playlists.find(item =>
      item.id === playlistId
    );

  if (!playlist) return;

  const playlistSongs =
    (playlist.songIds || [])
      .map(id =>
        songs.find(song =>
          song.id === id
        )
      )
      .filter(Boolean);

  showPage("playlists");

  playlistGrid.innerHTML = `

    <div style="grid-column:1/-1">

      <button
        class="secondary-button"
        id="backToPlaylists"
      >
        ← Back
      </button>

      <br><br>

      <h2>${escapeHTML(playlist.name)}</h2>

      <br>

      <div
        class="song-grid"
        id="openedPlaylistSongs"
      ></div>

    </div>
  `;

  renderSongs(
    playlistSongs,
    document.getElementById(
      "openedPlaylistSongs"
    )
  );

  document
    .getElementById("backToPlaylists")
    .onclick = renderPlaylists;

}


/* =====================================================
   PLAY MUSIC
===================================================== */

function playSong(id) {

  const index =
    songs.findIndex(song =>
      song.id === id
    );

  if (index === -1) return;

  currentSongIndex = index;

  const song =
    songs[currentSongIndex];

  audio.src = song.audioURL;

  audio.play().catch(error =>
    console.error(error)
  );

  document
    .getElementById("playerCover")
    .src =
      song.coverURL || DEFAULT_COVER;

  document
    .getElementById("playerTitle")
    .textContent =
      song.title || "Untitled";

  document
    .getElementById("playerArtist")
    .textContent =
      song.artist || "Unknown Artist";

  document
    .getElementById("playButton")
    .textContent = "❚❚";

  updatePlayerLike();

  addToRecentlyPlayed(id);

}


function togglePlay() {

  if (!audio.src) {

    if (songs.length) {

      playSong(songs[0].id);

    }

    return;

  }

  if (audio.paused) {

    audio.play();

    document
      .getElementById("playButton")
      .textContent = "❚❚";

  } else {

    audio.pause();

    document
      .getElementById("playButton")
      .textContent = "▶";

  }

}


function nextSong() {

  if (!songs.length) return;

  let nextIndex;

  if (shuffleEnabled) {

    nextIndex =
      Math.floor(
        Math.random() * songs.length
      );

  } else {

    nextIndex =
      currentSongIndex + 1;

    if (nextIndex >= songs.length) {

      nextIndex = 0;

    }

  }

  playSong(
    songs[nextIndex].id
  );

}


function previousSong() {

  if (!songs.length) return;

  let index =
    currentSongIndex - 1;

  if (index < 0) {

    index = songs.length - 1;

  }

  playSong(
    songs[index].id
  );

}


/* =====================================================
   SHUFFLE / REPEAT
===================================================== */

function toggleShuffle() {

  shuffleEnabled =
    !shuffleEnabled;

  document
    .getElementById("shuffleButton")
    .classList.toggle(
      "active",
      shuffleEnabled
    );

  showToast(
    shuffleEnabled
      ? "Shuffle on"
      : "Shuffle off"
  );

}


function toggleRepeat() {

  if (repeatMode === "off") {

    repeatMode = "one";

  } else if (repeatMode === "one") {

    repeatMode = "all";

  } else {

    repeatMode = "off";

  }

  const button =
    document.getElementById(
      "repeatButton"
    );

  button.classList.toggle(
    "active",
    repeatMode !== "off"
  );

  button.textContent =
    repeatMode === "one"
      ? "↻1"
      : "↻";

}


/* =====================================================
   AUDIO EVENTS
===================================================== */

audio.addEventListener(
  "timeupdate",
  () => {

    if (!audio.duration) return;

    const percentage =
      audio.currentTime /
      audio.duration *
      100;

    document
      .getElementById("progressBar")
      .value = percentage;

    document
      .getElementById("currentTime")
      .textContent =
        formatTime(audio.currentTime);

    document
      .getElementById("duration")
      .textContent =
        formatTime(audio.duration);

  }
);


audio.addEventListener(
  "ended",
  () => {

    if (repeatMode === "one") {

      audio.currentTime = 0;

      audio.play();

      return;

    }

    nextSong();

  }
);


document
  .getElementById("progressBar")
  .addEventListener(
    "input",
    event => {

      if (!audio.duration) return;

      audio.currentTime =
        event.target.value /
        100 *
        audio.duration;

    }
  );


document
  .getElementById("volumeBar")
  .addEventListener(
    "input",
    event => {

      audio.volume =
        Number(event.target.value);

    }
  );


function formatTime(seconds) {

  if (!Number.isFinite(seconds)) {

    return "0:00";

  }

  const minutes =
    Math.floor(seconds / 60);

  const secs =
    Math.floor(seconds % 60);

  return `${minutes}:${String(secs).padStart(2, "0")}`;

}


/* =====================================================
   LIKE
===================================================== */

function toggleLike(id) {

  if (likedSongs.includes(id)) {

    likedSongs =
      likedSongs.filter(
        item => item !== id
      );

  } else {

    likedSongs.push(id);

  }

  localStorage.setItem(
    "gaanxLiked",
    JSON.stringify(likedSongs)
  );

  renderAll();

  updatePlayerLike();

}


function updatePlayerLike() {

  const song =
    songs[currentSongIndex];

  const button =
    document.getElementById(
      "playerLike"
    );

  if (!song) {

    button.textContent = "♡";

    return;

  }

  button.textContent =
    likedSongs.includes(song.id)
      ? "♥"
      : "♡";

}


/* =====================================================
   RECENT
===================================================== */

function addToRecentlyPlayed(id) {

  recentlyPlayed =
    recentlyPlayed.filter(
      item => item !== id
    );

  recentlyPlayed.unshift(id);

  recentlyPlayed =
    recentlyPlayed.slice(0, 20);

  localStorage.setItem(
    "gaanxRecent",
    JSON.stringify(
      recentlyPlayed
    )
  );

  renderRecent();

}


/* =====================================================
   SEARCH
===================================================== */

function performSearch() {

  const query =
    searchInput.value
      .trim()
      .toLowerCase();

  if (!query) {

    searchSongsContainer.innerHTML = "";

    return;

  }

  const results =
    songs.filter(song => {

      const title =
        (song.title || "")
          .toLowerCase();

      const artist =
        (song.artist || "")
          .toLowerCase();

      const album =
        (song.album || "")
          .toLowerCase();

      return (
        title.includes(query) ||
        artist.includes(query) ||
        album.includes(query)
      );

    });

  renderSongs(
    results,
    searchSongsContainer
  );

}


/* =====================================================
   ADMIN AUTH
===================================================== */

document
  .getElementById("adminButton")
  .addEventListener(
    "click",
    () => {

      if (currentUser) {

        openAdminPanel();

      } else {

        openModal(
          "adminLoginModal"
        );

      }

    }
  );


document
  .getElementById("adminLoginButton")
  .addEventListener(
    "click",
    async () => {

      const email =
        document
          .getElementById(
            "adminEmail"
          )
          .value
          .trim();

      const password =
        document
          .getElementById(
            "adminPassword"
          )
          .value;

      const errorBox =
        document.getElementById(
          "loginError"
        );

      errorBox.textContent = "";

      if (!email || !password) {

        errorBox.textContent =
          "Enter email and password.";

        return;

      }

      try {

        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );

      } catch (error) {

        console.error(error);

        errorBox.textContent =
          "Invalid login details.";

      }

    }
  );


document
  .getElementById(
    "adminLogoutButton"
  )
  .addEventListener(
    "click",
    async () => {

      await signOut(auth);

      closeAdminPanel();

      showToast("Logged out.");

    }
  );


onAuthStateChanged(
  auth,
  user => {

    currentUser = user;

    if (user) {

      closeModal("adminLoginModal");

    }

  }
);


/* =====================================================
   ADMIN PANEL
===================================================== */

function openAdminPanel() {

  if (!currentUser) {

    openModal("adminLoginModal");

    return;

  }

  document
    .getElementById("adminPanel")
    .classList.add("show");

  renderAdminSongs();

  renderAdminPlaylists();

  renderAdminPlaylistOptions();

}


function closeAdminPanel() {

  document
    .getElementById("adminPanel")
    .classList.remove("show");

}


document
  .getElementById(
    "closeAdminButton"
  )
  .addEventListener(
    "click",
    closeAdminPanel
  );


/* =====================================================
   ADMIN TABS
===================================================== */

document
  .querySelectorAll(".admin-tab")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        document
          .querySelectorAll(
            ".admin-tab"
          )
          .forEach(item =>
            item.classList.remove(
              "active"
            )
          );

        document
          .querySelectorAll(
            ".admin-page"
          )
          .forEach(item =>
            item.classList.remove(
              "active"
            )
          );

        button.classList.add(
          "active"
        );

        document
          .getElementById(
            `admin-${button.dataset.adminTab}`
          )
          .classList.add(
            "active"
          );

      }
    );

  });


/* =====================================================
   UPLOAD SONG
===================================================== */

document
  .getElementById(
    "uploadSongButton"
  )
  .addEventListener(
    "click",
    uploadSong
  );


async function uploadSong() {

  if (!currentUser) {

    showToast("Admin login required.");

    return;

  }

  const title =
    document
      .getElementById(
        "songTitleInput"
      )
      .value
      .trim();

  const artist =
    document
      .getElementById(
        "songArtistInput"
      )
      .value
      .trim();

  const album =
    document
      .getElementById(
        "songAlbumInput"
      )
      .value
      .trim();

  const playlistId =
    document
      .getElementById(
        "songPlaylistInput"
      )
      .value;

  const audioFile =
    document
      .getElementById(
        "audioFileInput"
      )
      .files[0];

  const coverFile =
    document
      .getElementById(
        "coverFileInput"
      )
      .files[0];

  const status =
    document.getElementById(
      "uploadStatus"
    );

  const progress =
    document.getElementById(
      "uploadProgressBar"
    );


  if (!title || !artist || !audioFile) {

    showToast(
      "Title, artist and audio are required."
    );

    return;

  }


  try {

    status.textContent =
      "Uploading audio...";


    /* AUDIO */

    const audioPath =
      `songs/${Date.now()}_${safeFileName(audioFile.name)}`;

    const audioRef =
      ref(storage, audioPath);

    const audioUpload =
      uploadBytesResumable(
        audioRef,
        audioFile
      );


    const audioURL =
      await uploadWithProgress(
        audioUpload,
        progress
      );


    /* COVER */

    let coverURL = "";

    let coverPath = "";

    if (coverFile) {

      status.textContent =
        "Uploading cover...";

      coverPath =
        `covers/${Date.now()}_${safeFileName(coverFile.name)}`;

      const coverRef =
        ref(storage, coverPath);

      const coverUpload =
        uploadBytesResumable(
          coverRef,
          coverFile
        );

      coverURL =
        await uploadWithProgress(
          coverUpload,
          progress
        );

    }


    /* DATABASE */

    status.textContent =
      "Publishing song...";


    const songDoc =
      await addDoc(
        collection(db, "songs"),
        {
          title,
          artist,
          album,
          audioURL,
          coverURL,
          audioPath,
          coverPath,
          playlistId: playlistId || "",
          createdAt: serverTimestamp(),
          uploadedBy: currentUser.uid
        }
      );


    /* ADD TO PLAYLIST */

    if (playlistId) {

      const playlistRef =
        doc(
          db,
          "playlists",
          playlistId
        );

      const playlistSnap =
        await getDoc(playlistRef);

      if (playlistSnap.exists()) {

        const playlistData =
          playlistSnap.data();

        const songIds =
          playlistData.songIds || [];

        songIds.push(songDoc.id);

        await updateDoc(
          playlistRef,
          {
            songIds
          }
        );

      }

    }


    status.textContent =
      "Song published successfully.";

    progress.style.width = "100%";


    clearUploadForm();

    await loadSongs();

    await loadPlaylists();

    renderAdminSongs();

    showToast(
      "Song published successfully."
    );


  } catch (error) {

    console.error(error);

    status.textContent =
      "Upload failed.";

    showToast(
      "Upload failed. Check Firebase settings."
    );

  }

}


function uploadWithProgress(
  uploadTask,
  progressBar
) {

  return new Promise(
    (resolve, reject) => {

      uploadTask.on(
        "state_changed",

        snapshot => {

          const percentage =
            snapshot.bytesTransferred /
            snapshot.totalBytes *
            100;

          progressBar.style.width =
            `${percentage}%`;

        },

        reject,

        async () => {

          const url =
            await getDownloadURL(
              uploadTask.snapshot.ref
            );

          resolve(url);

        }
      );

    }
  );

}


/* =====================================================
   ADMIN SONG LIST
===================================================== */

function renderAdminSongs() {

  const container =
    document.getElementById(
      "adminSongList"
    );

  if (!songs.length) {

    container.innerHTML =
      "<p>No songs yet.</p>";

    return;

  }


  container.innerHTML =
    songs.map(song => `

      <div class="admin-song-row">

        <img
          src="${escapeHTML(song.coverURL || DEFAULT_COVER)}"
          alt=""
        >

        <div>

          <strong>
            ${escapeHTML(song.title)}
          </strong>

          <small>
            ${escapeHTML(song.artist)}
          </small>

        </div>

        <button
          class="delete-button"
          data-delete-song="${song.id}"
        >
          Delete
        </button>

      </div>

    `).join("");

}


/* =====================================================
   DELETE SONG
===================================================== */

async function deleteSong(id) {

  if (!currentUser) return;

  const song =
    songs.find(item =>
      item.id === id
    );

  if (!song) return;

  const confirmed =
    confirm(
      `Delete "${song.title}"?`
    );

  if (!confirmed) return;


  try {

    if (song.audioPath) {

      try {

        await deleteObject(
          ref(
            storage,
            song.audioPath
          )
        );

      } catch (error) {

        console.warn(
          "Audio file delete failed.",
          error
        );

      }

    }


    if (song.coverPath) {

      try {

        await deleteObject(
          ref(
            storage,
            song.coverPath
          )
        );

      } catch (error) {

        console.warn(
          "Cover delete failed.",
          error
        );

      }

    }


    await deleteDoc(
      doc(
        db,
        "songs",
        id
      )
    );


    /* Remove from playlists */

    for (const playlist of playlists) {

      if (
        (playlist.songIds || [])
          .includes(id)
      ) {

        const updated =
          playlist.songIds.filter(
            songId =>
              songId !== id
          );

        await updateDoc(
          doc(
            db,
            "playlists",
            playlist.id
          ),
          {
            songIds: updated
          }
        );

      }

    }


    await loadSongs();

    await loadPlaylists();

    renderAdminSongs();

    showToast(
      "Song deleted."
    );


  } catch (error) {

    console.error(error);

    showToast(
      "Could not delete song."
    );

  }

}


/* =====================================================
   ADMIN PLAYLIST
===================================================== */

function renderAdminPlaylists() {

  const container =
    document.getElementById(
      "adminPlaylistList"
    );

  container.innerHTML =
    playlists.map(playlist => `

      <div class="admin-playlist-row">

        <div>

          <strong>
            ${escapeHTML(playlist.name)}
          </strong>

          <small>
            ${(playlist.songIds || []).length} songs
          </small>

        </div>

        <button
          class="delete-button"
          data-delete-playlist="${playlist.id}"
        >
          Delete
        </button>

      </div>

    `).join("");

}


function renderAdminPlaylistOptions() {

  const select =
    document.getElementById(
      "songPlaylistInput"
    );

  select.innerHTML =
    `<option value="">No playlist</option>` +
    playlists.map(playlist => `
      <option value="${playlist.id}">
        ${escapeHTML(playlist.name)}
      </option>
    `).join("");

}


/* =====================================================
   DELETE PLAYLIST
===================================================== */

async function deletePlaylist(id) {

  const playlist =
    playlists.find(item =>
      item.id === id
    );

  if (!playlist) return;

  if (
    !confirm(
      `Delete playlist "${playlist.name}"?`
    )
  ) return;


  try {

    await deleteDoc(
      doc(
        db,
        "playlists",
        id
      )
    );

    await loadPlaylists();

    renderAdminPlaylists();

    showToast(
      "Playlist deleted."
    );

  } catch (error) {

    console.error(error);

    showToast(
      "Could not delete playlist."
    );

  }

}


/* =====================================================
   EVENT DELEGATION
===================================================== */

document.addEventListener(
  "click",
  event => {

    const playButton =
      event.target.closest(
        "[data-play]"
      );

    if (playButton) {

      playSong(
        playButton.dataset.play
      );

      return;

    }


    const likeButton =
      event.target.closest(
        "[data-like]"
      );

    if (likeButton) {

      toggleLike(
        likeButton.dataset.like
      );

      return;

    }


    const playlist =
      event.target.closest(
        "[data-playlist]"
      );

    if (
      playlist &&
      !playlist.dataset.playing
    ) {

      openPlaylist(
        playlist.dataset.playlist
      );

      return;

    }


    const deleteSongButton =
      event.target.closest(
        "[data-delete-song]"
      );

    if (deleteSongButton) {

      deleteSong(
        deleteSongButton.dataset.deleteSong
      );

      return;

    }


    const deletePlaylistButton =
      event.target.closest(
        "[data-delete-playlist]"
      );

    if (deletePlaylistButton) {

      deletePlaylist(
        deletePlaylistButton.dataset.deletePlaylist
      );

    }

  }
);


/* =====================================================
   NAVIGATION
===================================================== */

document
  .querySelectorAll(".nav-item[data-page]")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        showPage(
          button.dataset.page
        );

      }
    );

  });


function showPage(page) {

  document
    .querySelectorAll(".page")
    .forEach(item =>
      item.classList.remove(
        "active"
      )
    );

  const target =
    document.getElementById(
      `page-${page}`
    );

  if (target) {

    target.classList.add(
      "active"
    );

  }


  document
    .querySelectorAll(
      ".nav-item[data-page]"
    )
    .forEach(item => {

      item.classList.toggle(
        "active",
        item.dataset.page === page
      );

    });

}


/* =====================================================
   UI BUTTONS
===================================================== */

document
  .getElementById("playButton")
  .addEventListener(
    "click",
    togglePlay
  );

document
  .getElementById("nextButton")
  .addEventListener(
    "click",
    nextSong
  );

document
  .getElementById("previousButton")
  .addEventListener(
    "click",
    previousSong
  );

document
  .getElementById("shuffleButton")
  .addEventListener(
    "click",
    toggleShuffle
  );

document
  .getElementById("repeatButton")
  .addEventListener(
    "click",
    toggleRepeat
  );

document
  .getElementById("playerLike")
  .addEventListener(
    "click",
    () => {

      const song =
        songs[currentSongIndex];

      if (song) {

        toggleLike(song.id);

      }

    }
  );


document
  .getElementById(
    "heroPlayButton"
  )
  .addEventListener(
    "click",
    () => {

      if (songs.length) {

        playSong(
          songs[0].id
        );

      }

    }
  );


document
  .getElementById(
    "createPlaylistButton"
  )
  .addEventListener(
    "click",
    () =>
      openModal(
        "playlistModal"
      )
  );


document
  .getElementById(
    "savePlaylistButton"
  )
  .addEventListener(
    "click",
    createPlaylist
  );


document
  .querySelectorAll(
    "[data-close]"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () =>
        closeModal(
          button.dataset.close
        )
    );

  });


searchInput.addEventListener(
  "input",
  performSearch
);


/* =====================================================
   MOBILE SEARCH
===================================================== */

document
  .getElementById(
    "mobileSearchButton"
  )
  .addEventListener(
    "click",
    () => {

      showPage("search");

      searchInput.focus();

    }
  );


/* =====================================================
   MODALS
===================================================== */

function openModal(id) {

  document
    .getElementById(id)
    .classList.add("show");

}


function closeModal(id) {

  document
    .getElementById(id)
    .classList.remove("show");

}


/* =====================================================
   HELPERS
===================================================== */

function clearUploadForm() {

  document.getElementById(
    "songTitleInput"
  ).value = "";

  document.getElementById(
    "songArtistInput"
  ).value = "";

  document.getElementById(
    "songAlbumInput"
  ).value = "";

  document.getElementById(
    "audioFileInput"
  ).value = "";

  document.getElementById(
    "coverFileInput"
  ).value = "";

  document.getElementById(
    "uploadProgressBar"
  ).style.width = "0%";

}


function safeFileName(name) {

  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_");

}


function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function showToast(message) {

  const toast =
    document.getElementById(
      "toast"
    );

  toast.textContent = message;

  toast.classList.add("show");

  setTimeout(
    () =>
      toast.classList.remove(
        "show"
      ),
    2500
  );

}


/* =====================================================
   INITIALIZE
===================================================== */

audio.volume = 1;

loadSongs();

loadPlaylists();
