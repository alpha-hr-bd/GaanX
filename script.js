import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

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

import { firebaseConfig } from "./firebase-config.js";


/* ================= FIREBASE ================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);


/* ================= STATE ================= */

let songs = [];
let playlists = [];
let userPlaylists =
  JSON.parse(localStorage.getItem("gaanxUserPlaylists") || "[]");

let likedSongs =
  JSON.parse(localStorage.getItem("gaanxLiked") || "[]");

let recentlyPlayed =
  JSON.parse(localStorage.getItem("gaanxRecent") || "[]");

let currentSongIndex = -1;
let currentUser = null;
let shuffleEnabled = false;
let repeatMode = "off";
let selectedSongForPlaylist = null;


/* ================= DOM ================= */

const audio = document.getElementById("audio");

const DEFAULT_COVER =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
    <rect width="600" height="600" fill="#181818"/>
    <text x="300" y="340" text-anchor="middle"
    font-size="180" fill="#1ed760">G</text>
  </svg>`);


/* ================= FIRESTORE ================= */

async function loadSongs() {

  try {

    const q = query(
      collection(db, "songs"),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);

    songs = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    renderAll();
    renderAdminSongs();

  } catch (e) {

    console.error(e);
    showToast("Could not load songs.");

  }
}


async function loadPlaylists() {

  try {

    const snap =
      await getDocs(collection(db, "playlists"));

    playlists = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    renderPlaylists();
    renderAdminPlaylistOptions();
    renderAdminPlaylists();

  } catch (e) {

    console.error(e);

  }
}


/* ================= RENDER SONGS ================= */

function renderAll() {

  renderSongs(songs, document.getElementById("homeSongs"));
  renderLiked();
  renderRecent();

}


function renderSongs(list, container) {

  if (!container) return;

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

    const liked = likedSongs.includes(song.id);

    return `
      <article class="song-card">

        <button class="like-button"
          data-like="${song.id}">
          ${liked ? "♥" : "♡"}
        </button>

        <div class="cover-wrapper">

          <img
            class="song-cover"
            src="${escapeHTML(song.coverURL || DEFAULT_COVER)}"
            alt=""
          >

          <button
            class="card-play"
            data-play="${song.id}">
            ▶
          </button>

        </div>

        <div class="song-title">
          ${escapeHTML(song.title || "Untitled")}
        </div>

        <div class="song-artist">
          ${escapeHTML(song.artist || "Unknown Artist")}
        </div>

        <button
          class="add-playlist-button"
          data-add-playlist="${song.id}">
          + Playlist
        </button>

      </article>
    `;

  }).join("");
}


function renderLiked() {

  renderSongs(
    songs.filter(s => likedSongs.includes(s.id)),
    document.getElementById("likedSongs")
  );

}


function renderRecent() {

  const list = recentlyPlayed
    .map(id => songs.find(s => s.id === id))
    .filter(Boolean);

  renderSongs(
    list,
    document.getElementById("recentSongs")
  );

}


/* ================= PLAYLISTS ================= */

function renderPlaylists() {

  const all = [
    ...playlists.map(p => ({
      ...p,
      official: true
    })),

    ...userPlaylists.map(p => ({
      ...p,
      official: false
    }))
  ];

  const box = document.getElementById("playlistGrid");

  if (!all.length) {

    box.innerHTML = `
      <div class="empty-state">
        <div>♫</div>
        <p>No playlists yet.</p>
      </div>
    `;

    return;
  }

  box.innerHTML = all.map(p => `

    <article
      class="playlist-card"
      data-playlist="${escapeHTML(p.id)}">

      <div class="playlist-icon">♫</div>

      <h3>${escapeHTML(p.name)}</h3>

      <p>${(p.songIds || []).length} songs</p>

      ${p.official
        ? `<small class="official">OFFICIAL</small>`
        : `<small class="personal">YOUR PLAYLIST</small>`
      }

    </article>

  `).join("");
}


/* ================= USER PLAYLIST ================= */

function createPlaylist() {

  const input =
    document.getElementById("playlistNameInput");

  const name = input.value.trim();

  if (!name) {

    showToast("Enter playlist name.");

    return;
  }

  userPlaylists.push({

    id: "local_" + Date.now(),

    name,

    songIds: [],

    createdAt: Date.now()

  });

  localStorage.setItem(
    "gaanxUserPlaylists",
    JSON.stringify(userPlaylists)
  );

  input.value = "";

  closeModal("playlistModal");

  renderPlaylists();

  showToast("Playlist created.");
}


/* ================= OPEN PLAYLIST ================= */

function openPlaylist(id) {

  let playlist =
    playlists.find(p => p.id === id);

  if (!playlist) {

    playlist =
      userPlaylists.find(p => p.id === id);

  }

  if (!playlist) return;

  const list =
    (playlist.songIds || [])
      .map(id => songs.find(s => s.id === id))
      .filter(Boolean);

  const box =
    document.getElementById("playlistGrid");

  showPage("playlists");

  box.innerHTML = `

    <div class="playlist-open">

      <button class="secondary-button" id="backPlaylists">
        ← Back
      </button>

      <h2>${escapeHTML(playlist.name)}</h2>

      <p>${list.length} songs</p>

      <div class="song-grid" id="openedPlaylistSongs"></div>

    </div>
  `;

  renderSongs(
    list,
    document.getElementById("openedPlaylistSongs")
  );

  document.getElementById("backPlaylists")
    .onclick = renderPlaylists;
}


/* ================= ADD SONG ================= */

function openAddPlaylist(songId) {

  const song =
    songs.find(s => s.id === songId);

  if (!song) return;

  selectedSongForPlaylist = songId;

  document.getElementById("addPlaylistSongName")
    .textContent =
    `Add "${song.title}" to a playlist`;

  const box =
    document.getElementById("addPlaylistOptions");

  if (!userPlaylists.length) {

    box.innerHTML = `
      <p class="modal-subtitle">
        You don't have a personal playlist yet.
      </p>

      <button
        class="primary-button full-button"
        id="createFromAdd">
        + Create Playlist
      </button>
    `;

    openModal("addPlaylistModal");

    document.getElementById("createFromAdd")
      .onclick = () => {

        closeModal("addPlaylistModal");

        openModal("playlistModal");

      };

    return;
  }

  box.innerHTML =
    userPlaylists.map(p => `

      <button
        class="playlist-select-button"
        data-select-playlist="${p.id}">
        ♫ ${escapeHTML(p.name)}
      </button>

    `).join("");

  openModal("addPlaylistModal");
}


function addSongToPlaylist(playlistId) {

  if (!selectedSongForPlaylist) return;

  const playlist =
    userPlaylists.find(p => p.id === playlistId);

  if (!playlist) return;

  if (!playlist.songIds.includes(selectedSongForPlaylist)) {

    playlist.songIds.push(selectedSongForPlaylist);

    localStorage.setItem(
      "gaanxUserPlaylists",
      JSON.stringify(userPlaylists)
    );

    showToast("Song added to playlist.");

  } else {

    showToast("Song already exists.");

  }

  closeModal("addPlaylistModal");

  renderPlaylists();
}


/* ================= PLAYER ================= */

function playSong(id) {

  const index =
    songs.findIndex(s => s.id === id);

  if (index === -1) return;

  currentSongIndex = index;

  const song = songs[index];

  audio.src = song.audioURL;

  audio.play()
    .then(() => {
      document.getElementById("playButton")
        .textContent = "❚❚";
    })
    .catch(console.error);

  document.getElementById("playerCover")
    .src = song.coverURL || DEFAULT_COVER;

  document.getElementById("playerTitle")
    .textContent = song.title || "Untitled";

  document.getElementById("playerArtist")
    .textContent = song.artist || "Unknown Artist";

  addRecent(id);

  updatePlayerLike();
}


function togglePlay() {

  if (!audio.src) {

    if (songs.length)
      playSong(songs[0].id);

    return;
  }

  if (audio.paused) {

    audio.play();

  } else {

    audio.pause();

  }

}


function nextSong() {

  if (!songs.length) return;

  let i;

  if (shuffleEnabled) {

    i = Math.floor(Math.random() * songs.length);

  } else {

    i = currentSongIndex + 1;

    if (i >= songs.length)
      i = 0;

  }

  playSong(songs[i].id);
}


function previousSong() {

  if (!songs.length) return;

  let i = currentSongIndex - 1;

  if (i < 0)
    i = songs.length - 1;

  playSong(songs[i].id);
}


/* ================= AUDIO ================= */

audio.addEventListener("timeupdate", () => {

  if (!audio.duration) return;

  document.getElementById("progressBar").value =
    (audio.currentTime / audio.duration) * 100;

  document.getElementById("currentTime")
    .textContent = formatTime(audio.currentTime);

  document.getElementById("duration")
    .textContent = formatTime(audio.duration);

});


audio.addEventListener("play", () => {

  document.getElementById("playButton")
    .textContent = "❚❚";

});


audio.addEventListener("pause", () => {

  document.getElementById("playButton")
    .textContent = "▶";

});


audio.addEventListener("ended", () => {

  if (repeatMode === "one") {

    audio.currentTime = 0;
    audio.play();

  } else {

    nextSong();

  }

});


document.getElementById("progressBar")
  .addEventListener("input", e => {

    if (audio.duration)
      audio.currentTime =
        Number(e.target.value) / 100 * audio.duration;

  });


document.getElementById("volumeBar")
  .addEventListener("input", e => {

    audio.volume = Number(e.target.value);

  });


/* ================= LIKE ================= */

function toggleLike(id) {

  if (likedSongs.includes(id)) {

    likedSongs =
      likedSongs.filter(x => x !== id);

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

  const song = songs[currentSongIndex];

  const button =
    document.getElementById("playerLike");

  button.textContent =
    song && likedSongs.includes(song.id)
      ? "♥"
      : "♡";
}


/* ================= RECENT ================= */

function addRecent(id) {

  recentlyPlayed =
    recentlyPlayed.filter(x => x !== id);

  recentlyPlayed.unshift(id);

  recentlyPlayed =
    recentlyPlayed.slice(0, 20);

  localStorage.setItem(
    "gaanxRecent",
    JSON.stringify(recentlyPlayed)
  );

  renderRecent();
}


/* ================= SEARCH ================= */

document.getElementById("searchInput")
  .addEventListener("input", e => {

    const q =
      e.target.value.trim().toLowerCase();

    const result =
      songs.filter(s =>
        `${s.title} ${s.artist} ${s.album}`
          .toLowerCase()
          .includes(q)
      );

    renderSongs(
      q ? result : [],
      document.getElementById("searchSongs")
    );

  });


/* ================= ADMIN LOGIN ================= */

document.getElementById("adminButton")
  .onclick = () => {

    if (currentUser)
      openAdminPanel();

    else
      openModal("adminLoginModal");

  };


document.getElementById("adminLoginButton")
  .onclick = async () => {

    const email =
      document.getElementById("adminEmail").value.trim();

    const password =
      document.getElementById("adminPassword").value;

    const error =
      document.getElementById("loginError");

    error.textContent = "";

    if (!email || !password) {

      error.textContent =
        "Enter email and password.";

      return;
    }

    try {

      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

    } catch (e) {

      console.error(e);

      error.textContent =
        "Wrong email or password.";

    }
  };


onAuthStateChanged(auth, user => {

  currentUser = user;

  if (user)
    closeModal("adminLoginModal");

});


/* ================= ADMIN PANEL ================= */

function openAdminPanel() {

  if (!currentUser) {

    openModal("adminLoginModal");

    return;
  }

  document.getElementById("adminPanel")
    .classList.add("show");

  renderAdminSongs();
  renderAdminPlaylists();
  renderAdminPlaylistOptions();
}


function closeAdminPanel() {

  document.getElementById("adminPanel")
    .classList.remove("show");

}


document.getElementById("closeAdminButton")
  .onclick = closeAdminPanel;


document.getElementById("adminLogoutButton")
  .onclick = async () => {

    await signOut(auth);

    closeAdminPanel();

    showToast("Logged out.");

  };


/* ================= ADMIN TABS ================= */

document.querySelectorAll(".admin-tab")
  .forEach(button => {

    button.onclick = () => {

      document.querySelectorAll(".admin-tab")
        .forEach(x => x.classList.remove("active"));

      document.querySelectorAll(".admin-page")
        .forEach(x => x.classList.remove("active"));

      button.classList.add("active");

      document.getElementById(
        `admin-${button.dataset.adminTab}`
      ).classList.add("active");

    };

  });


/* ================= ADMIN UPLOAD ================= */

document.getElementById("uploadSongButton")
  .onclick = uploadSong;


async function uploadSong() {

  if (!currentUser) {

    showToast("Admin login required.");

    return;
  }

  const title =
    document.getElementById("songTitleInput").value.trim();

  const artist =
    document.getElementById("songArtistInput").value.trim();

  const album =
    document.getElementById("songAlbumInput").value.trim();

  const playlistId =
    document.getElementById("songPlaylistInput").value;

  const audioFile =
    document.getElementById("audioFileInput").files[0];

  const coverFile =
    document.getElementById("coverFileInput").files[0];

  const progress =
    document.getElementById("uploadProgressBar");

  const status =
    document.getElementById("uploadStatus");

  if (!title || !artist || !audioFile) {

    showToast("Title, artist and MP3 required.");

    return;
  }

  try {

    status.textContent = "Uploading MP3...";

    const audioPath =
      `songs/${Date.now()}_${safeFileName(audioFile.name)}`;

    const audioTask =
      uploadBytesResumable(
        ref(storage, audioPath),
        audioFile
      );

    const audioURL =
      await uploadFile(audioTask, progress);

    let coverURL = "";
    let coverPath = "";

    if (coverFile) {

      status.textContent =
        "Uploading cover...";

      coverPath =
        `covers/${Date.now()}_${safeFileName(coverFile.name)}`;

      const coverTask =
        uploadBytesResumable(
          ref(storage, coverPath),
          coverFile
        );

      coverURL =
        await uploadFile(coverTask, progress);
    }

    status.textContent =
      "Publishing...";

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

    if (playlistId) {

      const pRef =
        doc(db, "playlists", playlistId);

      const pSnap =
        await getDoc(pRef);

      if (pSnap.exists()) {

        const ids =
          pSnap.data().songIds || [];

        ids.push(songDoc.id);

        await updateDoc(
          pRef,
          { songIds: ids }
        );

      }
    }

    progress.style.width = "100%";

    status.textContent =
      "Song published successfully!";

    clearUploadForm();

    await loadSongs();
    await loadPlaylists();

    showToast("🎵 Song published!");

  } catch (e) {

    console.error(e);

    status.textContent =
      "Upload failed.";

    showToast(
      "Upload failed. Check Firebase Rules."
    );

  }
}


function uploadFile(task, bar) {

  return new Promise((resolve, reject) => {

    task.on(
      "state_changed",

      snap => {

        const percent =
          snap.bytesTransferred /
          snap.totalBytes * 100;

        bar.style.width = percent + "%";

      },

      reject,

      async () => {

        resolve(
          await getDownloadURL(task.snapshot.ref)
        );

      }
    );

  });
}


/* ================= ADMIN SONGS ================= */

function renderAdminSongs() {

  const box =
    document.getElementById("adminSongList");

  if (!songs.length) {

    box.innerHTML = "<p>No songs yet.</p>";

    return;
  }

  box.innerHTML =
    songs.map(s => `

      <div class="admin-song-row">

        <img src="${escapeHTML(s.coverURL || DEFAULT_COVER)}">

        <div>
          <strong>${escapeHTML(s.title)}</strong>
          <small>${escapeHTML(s.artist)}</small>
        </div>

        <button
          class="delete-button"
          data-delete-song="${s.id}">
          Delete
        </button>

      </div>

    `).join("");
}


async function deleteSong(id) {

  if (!currentUser) return;

  const song =
    songs.find(s => s.id === id);

  if (!song) return;

  if (!confirm(`Delete "${song.title}"?`))
    return;

  try {

    if (song.audioPath) {

      try {
        await deleteObject(
          ref(storage, song.audioPath)
        );
      } catch {}

    }

    if (song.coverPath) {

      try {
        await deleteObject(
          ref(storage, song.coverPath)
        );
      } catch {}

    }

    await deleteDoc(
      doc(db, "songs", id)
    );

    for (const playlist of playlists) {

      if ((playlist.songIds || []).includes(id)) {

        await updateDoc(
          doc(db, "playlists", playlist.id),
          {
            songIds:
              playlist.songIds.filter(x => x !== id)
          }
        );

      }
    }

    await loadSongs();
    await loadPlaylists();

    showToast("Song deleted.");

  } catch (e) {

    console.error(e);

    showToast("Could not delete song.");

  }
}


/* ================= ADMIN PLAYLISTS ================= */

function renderAdminPlaylistOptions() {

  const select =
    document.getElementById("songPlaylistInput");

  select.innerHTML =
    `<option value="">No playlist</option>` +
    playlists.map(p => `
      <option value="${p.id}">
        ${escapeHTML(p.name)}
      </option>
    `).join("");
}


function renderAdminPlaylists() {

  const box =
    document.getElementById("adminPlaylistList");

  if (!playlists.length) {

    box.innerHTML =
      "<p>No official playlists.</p>";

    return;
  }

  box.innerHTML =
    playlists.map(p => `

      <div class="admin-playlist-row">

        <div>
          <strong>${escapeHTML(p.name)}</strong>
          <small>${(p.songIds || []).length} songs</small>
        </div>

        <button
          class="delete-button"
          data-delete-playlist="${p.id}">
          Delete
        </button>

      </div>

    `).join("");
}


document.getElementById("adminCreatePlaylist")
  .onclick = async () => {

    if (!currentUser) return;

    const input =
      document.getElementById("adminPlaylistName");

    const name = input.value.trim();

    if (!name) {

      showToast("Enter playlist name.");

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

      input.value = "";

      await loadPlaylists();

      showToast("Official playlist created.");

    } catch (e) {

      console.error(e);

      showToast("Could not create playlist.");

    }
  };


async function deletePlaylist(id) {

  if (!currentUser) return;

  const p =
    playlists.find(x => x.id === id);

  if (!p) return;

  if (!confirm(`Delete "${p.name}"?`))
    return;

  try {

    await deleteDoc(
      doc(db, "playlists", id)
    );

    await loadPlaylists();

    showToast("Playlist deleted.");

  } catch (e) {

    console.error(e);

    showToast("Could not delete playlist.");

  }
}


/* ================= CLICK EVENTS ================= */

document.addEventListener("click", e => {

  const play =
    e.target.closest("[data-play]");

  if (play) {

    playSong(play.dataset.play);

    return;
  }


  const like =
    e.target.closest("[data-like]");

  if (like) {

    toggleLike(like.dataset.like);

    return;
  }


  const add =
    e.target.closest("[data-add-playlist]");

  if (add) {

    openAddPlaylist(
      add.dataset.addPlaylist
    );

    return;
  }


  const select =
    e.target.closest("[data-select-playlist]");

  if (select) {

    addSongToPlaylist(
      select.dataset.selectPlaylist
    );

    return;
  }


  const playlist =
    e.target.closest("[data-playlist]");

  if (playlist) {

    openPlaylist(
      playlist.dataset.playlist
    );

    return;
  }


  const delSong =
    e.target.closest("[data-delete-song]");

  if (delSong) {

    deleteSong(
      delSong.dataset.deleteSong
    );

    return;
  }


  const delPlaylist =
    e.target.closest("[data-delete-playlist]");

  if (delPlaylist) {

    deletePlaylist(
      delPlaylist.dataset.deletePlaylist
    );

  }

});


/* ================= NAVIGATION ================= */

document.querySelectorAll("[data-page]")
  .forEach(button => {

    button.onclick = () =>
      showPage(button.dataset.page);

  });


function showPage(page) {

  document.querySelectorAll(".page")
    .forEach(p =>
      p.classList.remove("active")
    );

  const target =
    document.getElementById(`page-${page}`);

  if (target)
    target.classList.add("active");

  document.querySelectorAll("[data-page]")
    .forEach(x =>
      x.classList.toggle(
        "active",
        x.dataset.page === page
      )
    );

}


/* ================= PLAYER BUTTONS ================= */

document.getElementById("playButton")
  .onclick = togglePlay;

document.getElementById("nextButton")
  .onclick = nextSong;

document.getElementById("previousButton")
  .onclick = previousSong;


document.getElementById("shuffleButton")
  .onclick = () => {

    shuffleEnabled = !shuffleEnabled;

    document.getElementById("shuffleButton")
      .classList.toggle("active", shuffleEnabled);

  };


document.getElementById("repeatButton")
  .onclick = () => {

    if (repeatMode === "off")
      repeatMode = "one";

    else if (repeatMode === "one")
      repeatMode = "all";

    else
      repeatMode = "off";

    document.getElementById("repeatButton")
      .classList.toggle(
        "active",
        repeatMode !== "off"
      );

  };


document.getElementById("playerLike")
  .onclick = () => {

    const song = songs[currentSongIndex];

    if (song)
      toggleLike(song.id);

  };


document.getElementById("heroPlayButton")
  .onclick = () => {

    if (songs.length)
      playSong(songs[0].id);

  };


document.getElementById("createPlaylistButton")
  .onclick = () =>
    openModal("playlistModal");


document.getElementById("savePlaylistButton")
  .onclick = createPlaylist;


document.querySelectorAll("[data-close]")
  .forEach(button => {

    button.onclick = () =>
      closeModal(button.dataset.close);

  });


document.getElementById("mobileSearchButton")
  .onclick = () => {

    showPage("search");

    document.getElementById("searchInput").focus();

  };


/* ================= HELPERS ================= */

function openModal(id) {

  document.getElementById(id)
    .classList.add("show");

}


function closeModal(id) {

  document.getElementById(id)
    .classList.remove("show");

}


function formatTime(sec) {

  if (!Number.isFinite(sec))
    return "0:00";

  const min = Math.floor(sec / 60);

  const s =
    Math.floor(sec % 60)
      .toString()
      .padStart(2, "0");

  return `${min}:${s}`;

}


function safeFileName(name) {

  return name.replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );

}


function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function showToast(message) {

  const toast =
    document.getElementById("toast");

  toast.textContent = message;

  toast.classList.add("show");

  setTimeout(
    () => toast.classList.remove("show"),
    2500
  );

}


function clearUploadForm() {

  document.getElementById("songTitleInput").value = "";
  document.getElementById("songArtistInput").value = "";
  document.getElementById("songAlbumInput").value = "";
  document.getElementById("audioFileInput").value = "";
  document.getElementById("coverFileInput").value = "";
  document.getElementById("uploadProgressBar").style.width = "0%";

}


/* ================= START ================= */

audio.volume = 1;

loadSongs();
loadPlaylists();
