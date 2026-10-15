"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Snackbar from "@mui/material/Snackbar";
import CloseIcon from "@mui/icons-material/Close";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MenuIcon from "@mui/icons-material/Menu";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RepeatIcon from "@mui/icons-material/Repeat";
import RepeatOneIcon from "@mui/icons-material/RepeatOne";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import VolumeDownIcon from "@mui/icons-material/VolumeDown";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import { convertToMp3 } from "@/lib/convertToMP3";
import { extractPalette } from "@/lib/extractPalette";
import styles from "./AudioVisualizer.module.css";

/**
 * One song in the playlist. Right now `src` and `cover` are local blob: URLs
 * made from uploaded files. Later, songs saved to a user's account can use
 * the same shape with URLs from file storage, and the player won't change.
 */
export type Song = {
  id: string;
  title: string;
  artist: string;
  src: string;
  cover: string | null;
};

//type Preset = { id: string; name: string; image: string };

/** The message shown at the top of the screen about a song that can't play. */
type Notice =
  | { kind: "unsupported"; songId: string }
  | { kind: "converting"; songId: string; progress: number | null }
  | { kind: "converted"; songId: string }
  | { kind: "convertFailed"; songId: string };

// Background images hosted in S3.
/*const IMAGE_BASE = "https://jeremymbeckerbucket.s3.us-west-1.amazonaws.com";

const PRESETS: Preset[] = [
  { id: "default", name: "Default", image: `${IMAGE_BASE}/Music_Is_Fun.jpg` },
  { id: "retrowave", name: "Retrowave", image: `${IMAGE_BASE}/Retrowave.jpg` },
  { id: "sunset", name: "Sunset at Beach", image: `${IMAGE_BASE}/Sunset_At_Beach.jpg` },
  { id: "clouds", name: "Above the Clouds", image: `${IMAGE_BASE}/Above_The_Clouds.png` },
];
*/
/** A gradient color at a position from 0 (bottom of a bar) to 1 (top). */
type ColorStop = [offset: number, color: string];
type Preset = { id: string; name: string; image: string; colors?: ColorStop[] };

// The original hand-picked bar colors: blue at the bottom, yellow at the top.
const RETROWAVE_COLORS: ColorStop[] = [
  [0, "#3B16DE"],
  [0.075, "#071AD6"],
  [0.175, "#66209d"],
  [0.275, "#AF0D49"],
  [0.375, "#F20A08"],
  [0.5, "#F22707"],
  [0.625, "#FF4E15"],
  [0.75, "#F96A0A"],
  [0.875, "#F8990B"],
  [1, "#F1E60E"],
];

// Background images hosted in S3.
const IMAGE_BASE = "https://jeremymbeckerbucket.s3.us-west-1.amazonaws.com";

// Presets with `colors` use those. The rest get colors picked from their image.
const PRESETS: Preset[] = [
  { id: "default", name: "Default", image: `${IMAGE_BASE}/Music_Is_Fun.jpg` },
  { id: "retrowave", name: "Retrowave", image: `${IMAGE_BASE}/Retrowave.jpg`, colors: RETROWAVE_COLORS },
  { id: "sunset", name: "Sunset at Beach", image: `${IMAGE_BASE}/Sunset_At_Beach.jpg` },
  { id: "clouds", name: "Above the Clouds", image: `${IMAGE_BASE}/Above_The_Clouds.png` },
];

const BAR_COUNT = 512;
const CONTROLS_HEIGHT = 206;
const iconSx = { color: "black", fontSize: 48 };

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** Reads a song's title, artist and album art. Falls back to the file name if tags are missing. */
async function readSong(file: File): Promise<Song> {
  const song: Song = {
    id: crypto.randomUUID(),
    title: file.name.replace(/\.[^/.]+$/, ""),
    artist: "Unknown artist",
    src: URL.createObjectURL(file),
    cover: null,
  };

  try {
    // Loaded only when someone uploads, so it isn't part of the initial page load.
    const { parseBlob } = await import("music-metadata");
    const { common } = await parseBlob(file);
    if (common.title) song.title = common.title;
    if (common.artist) song.artist = common.artist;
    const picture = common.picture?.[0];
    if (picture) {
      const imageBytes = new Uint8Array(picture.data);
      song.cover = URL.createObjectURL(new Blob([imageBytes], { type: picture.format }));
    }
  } catch (error) {
    console.warn(`Couldn't read tags from ${file.name}`, error);
  }

  return song;
}

export default function AudioVisualizer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lastVolumeRef = useRef(100);
  const gradientRef = useRef<CanvasGradient | null>(null);
  const palettesStartedRef = useRef(new Set<string>());

  const [autoPalettes, setAutoPalettes] = useState<Record<string, ColorStop[]>>({});
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [repeat, setRepeat] = useState(false);
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const currentSong = currentIndex === null ? null : (playlist[currentIndex] ?? null);
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  
  // Hand-picked colors win, then colors read from the image. Null means still loading.
  const barColors = preset.colors ?? autoPalettes[preset.id] ?? null;
  const progress = duration ? (currentTime / duration) * 100 : 0;
  const noticeSong = notice ? playlist.find((s) => s.id === notice.songId) : undefined;

  // Keep the audio element's volume in sync with the slider.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  // Work out colors from the background images: the current one right away,
  // and all of them once the Presets list is opened, so each is ready before it's clicked.
  useEffect(() => {
    const toLoad = presetsOpen ? PRESETS : [preset];
    for (const p of toLoad) {
      if (p.colors || palettesStartedRef.current.has(p.id)) continue;
      palettesStartedRef.current.add(p.id);
      extractPalette(p.image)
        .then((colors) => {
          const stops = colors.map((color, i): ColorStop => [i / (colors.length - 1), color]);
          setAutoPalettes((prev) => ({ ...prev, [p.id]: stops }));
        })
        .catch((error) => {
          console.warn(`Couldn't read colors from the ${p.name} background`, error);
          setAutoPalettes((prev) => ({ ...prev, [p.id]: RETROWAVE_COLORS }));
        });
    }
  }, [preset, presetsOpen]);

  // Rebuild the bar gradient when the colors change. While new colors are
  // still loading, the previous gradient stays in place.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !barColors) return;
    const gradient = ctx.createLinearGradient(0, 0, 0, 1);
    for (const [offset, color] of barColors) gradient.addColorStop(offset, color);
    gradientRef.current = gradient;
  }, [barColors]);

  // Size the canvas to the window and run the drawing loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // One gradient in a 0-to-1 space: 0 is the bottom of a bar, 1 is the top.
    // Each bar stretches that space to its own size, so every bar shows the
    // full gradient, and only one gradient is ever created.
    const gradient = ctx.createLinearGradient(0, 0, 0, 1);
    gradient.addColorStop(0, "#3B16DE");
    gradient.addColorStop(0.075, "#071AD6");
    gradient.addColorStop(0.175, "#66209d");
    gradient.addColorStop(0.275, "#AF0D49");
    gradient.addColorStop(0.375, "#F20A08");
    gradient.addColorStop(0.5, "#F22707");
    gradient.addColorStop(0.625, "#FF4E15");
    gradient.addColorStop(0.75, "#F96A0A");
    gradient.addColorStop(0.875, "#F8990B");
    gradient.addColorStop(1, "#F1E60E");

    let data = new Uint8Array(0);
    let frameId = 0;

    const draw = () => {
      frameId = requestAnimationFrame(draw);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const analyser = analyserRef.current;
      if (!analyser) return; // nothing has played yet

      if (data.length !== analyser.frequencyBinCount) {
        data = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(data);

      const baseline = canvas.height - CONTROLS_HEIGHT;
      const maxBarHeight = Math.max(0, Math.min(510, baseline - 20));
      const barWidth = canvas.width / BAR_COUNT;
      //ctx.fillStyle = gradient;
      const gradient = gradientRef.current;
      if (!gradient) 
        return;
      ctx.fillStyle = gradient;

      for (let i = 0; i < BAR_COUNT; i++) {
        const barHeight = (data[(i + 10) * 10] / 255) * maxBarHeight;
        if (barHeight < 1) continue;
        // Stretch a 1x1 square into this bar: starting at the baseline and growing upward.
        ctx.setTransform(barWidth, 0, 0, -barHeight, i * barWidth, baseline);
        ctx.fillRect(0, 0, 1, 1);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };
    frameId = requestAnimationFrame(draw);

    // Stops the loop and listener if the component goes away.
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  /** Connects the audio element to an analyser. Only happens once, on the first play. */
  const ensureAudioGraph = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioCtxRef.current) {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32768;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    }

    // Browsers start audio paused until the user interacts with the page.
    if (audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume();
    }
  };

  const playIndex = (index: number) => {
    const audio = audioRef.current;
    const song = playlist[index];
    if (!audio || !song) return;

    ensureAudioGraph();
    if (index !== currentIndex || !audio.src) {
      audio.src = song.src;
      setCurrentTime(0);
      setDuration(0);
      // Clear an old message when switching songs, unless a conversion is running.
      setNotice((prev) => (prev?.kind === "converting" ? prev : null));
    }
    setCurrentIndex(index);
    audio.play().catch((error) => console.warn("Playback failed", error));
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || playlist.length === 0) return;

    if (currentIndex === null) {
      playIndex(0);
    } else if (audio.paused) {
      ensureAudioGraph();
      audio.play().catch((error) => console.warn("Playback failed", error));
    } else {
      audio.pause();
    }
  };

  const playNext = () => {
    if (playlist.length === 0) return;
    playIndex(currentIndex === null ? 0 : (currentIndex + 1) % playlist.length);
  };

  const playPrevious = () => {
    if (playlist.length === 0) return;
    playIndex(currentIndex === null ? 0 : (currentIndex - 1 + playlist.length) % playlist.length);
  };

  const playRandom = () => {
    if (playlist.length === 0) return;
    let index = Math.floor(Math.random() * playlist.length);
    while (playlist.length > 1 && index === currentIndex) {
      index = Math.floor(Math.random() * playlist.length);
    }
    playIndex(index);
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ""; // lets you pick the same file again later
    if (files.length === 0) return;

    const songs = await Promise.all(files.map(readSong));
    setPlaylist((previous) => [...previous, ...songs]);
    setPlaylistOpen(true);
  };

  /** Converts a song that won't play into an MP3, swaps it into the playlist, and plays it. */
  const handleConvert = async (songId: string) => {
    const index = playlist.findIndex((s) => s.id === songId);
    const song = playlist[index];
    if (!song) return;

    setNotice({ kind: "converting", songId, progress: null });
    try {
      const original = await (await fetch(song.src)).blob();
      const mp3 = await convertToMp3(original, (p) =>
        setNotice({ kind: "converting", songId, progress: p }),
      );
      const mp3Url = URL.createObjectURL(mp3);
      setPlaylist((prev) => prev.map((s) => (s.id === songId ? { ...s, src: mp3Url } : s)));
      setNotice({ kind: "converted", songId });

      // Only start playing if the user hasn't moved on to a different song meanwhile.
      const audio = audioRef.current;
      if (audio && audio.src === song.src) {
        ensureAudioGraph();
        audio.src = mp3Url;
        setCurrentIndex(index);
        setCurrentTime(0);
        setDuration(0);
        audio.play().catch((error) => console.warn("Playback failed", error));
      }
      URL.revokeObjectURL(song.src); // free the original file's memory
    } catch (error) {
      console.warn("Conversion failed", error);
      setNotice({ kind: "convertFailed", songId });
    }
  };

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const time = (Number(event.target.value) / 100) * duration;
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const toggleMute = () => {
    if (volume > 0) {
      lastVolumeRef.current = volume;
      setVolume(0);
    } else {
      setVolume(lastVolumeRef.current || 100);
    }
  };

  const dismissNotice = () => setNotice(null);

  const VolumeIcon = volume === 0 ? VolumeOffIcon : volume < 50 ? VolumeDownIcon : VolumeUpIcon;

  const closeButton = (
    <IconButton size="small" color="inherit" aria-label="Dismiss" onClick={dismissNotice}>
      <CloseIcon fontSize="small" />
    </IconButton>
  );

  return (
    <div className={styles.root} style={{ backgroundImage: `url(${preset.image})` }}>
      <canvas ref={canvasRef} className={styles.canvas} />

      <audio
        ref={audioRef}
        loop={repeat}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={playNext}
        onError={() => {
          const song = currentSong;
          if (!song) return;
          setNotice((prev) =>
            prev?.kind === "converting" ? prev : { kind: "unsupported", songId: song.id },
          );
        }}
      />

      <div
        className={styles.albumCover}
        style={currentSong?.cover ? { backgroundImage: `url(${currentSong.cover})` } : undefined}
      />

      <div className={styles.controlsBar}>
        <div className={styles.sliderRow}>
          <span className={styles.time}>{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={100}
            step="any"
            value={progress}
            onChange={handleSeek}
            disabled={!currentSong}
            aria-label="Seek"
            className={styles.seekSlider}
            style={{
              background: `linear-gradient(90deg, rgb(50, 30, 200) ${progress}%, rgb(251, 243, 236) ${progress}%)`,
            }}
          />
          <span className={styles.time}>{formatTime(duration)}</span>
        </div>

        <div className={styles.songInfo}>
          <p className={styles.songTitle}>{currentSong?.title ?? "No song playing"}</p>
          <p className={styles.songArtist}>{currentSong?.artist ?? "Open the menu to add music"}</p>
        </div>

        <div className={styles.controls}>
          <div>
            <IconButton
              aria-label="Open menu"
              onClick={(e) => {
                e.currentTarget.blur();
                setDrawerOpen(true);
              }}
              sx={iconSx}
            >
              <MenuIcon fontSize="inherit" />
            </IconButton>
          </div>

          <div className={styles.playControls}>
            <div className={styles.volumeControls}>
              <IconButton aria-label={volume === 0 ? "Unmute" : "Mute"} onClick={toggleMute} sx={iconSx}>
                <VolumeIcon fontSize="inherit" />
              </IconButton>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Volume"
                className={styles.volumeSlider}
                style={{
                  background: `linear-gradient(90deg, rgb(168, 221, 240) ${volume}%, rgb(251, 243, 236) ${volume}%)`,
                }}
              />
            </div>
            <IconButton aria-label="Previous song" onClick={playPrevious} sx={iconSx}>
              <SkipPreviousIcon fontSize="inherit" />
            </IconButton>
            <IconButton aria-label={isPlaying ? "Pause" : "Play"} onClick={togglePlay} sx={iconSx}>
              {isPlaying ? <PauseIcon fontSize="inherit" /> : <PlayArrowIcon fontSize="inherit" />}
            </IconButton>
            <IconButton aria-label="Next song" onClick={playNext} sx={iconSx}>
              <SkipNextIcon fontSize="inherit" />
            </IconButton>
            <IconButton aria-label="Play a random song" onClick={playRandom} sx={iconSx}>
              <ShuffleIcon fontSize="inherit" />
            </IconButton>
          </div>

          <div>
            <IconButton
              aria-label={repeat ? "Turn off repeat" : "Repeat this song"}
              aria-pressed={repeat}
              onClick={() => setRepeat((r) => !r)}
              sx={{ ...iconSx, color: repeat ? "rgb(50, 30, 200)" : "black" }}
            >
              {repeat ? <RepeatOneIcon fontSize="inherit" /> : <RepeatIcon fontSize="inherit" />}
            </IconButton>
          </div>
        </div>
      </div>

      <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 250 }} role="presentation">
          <List component="nav">
            <ListItemButton onClick={() => setPlaylistOpen((open) => !open)}>
              <ListItemText primary={`Playlist (${playlist.length})`} />
              {playlistOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </ListItemButton>
            <Collapse in={playlistOpen} timeout="auto" unmountOnExit>
              <List disablePadding sx={{ maxHeight: 250, overflow: "auto" }}>
                {playlist.length === 0 && (
                  <ListItemText sx={{ pl: 4, py: 1 }} secondary="No songs yet" />
                )}
                {playlist.map((song, index) => (
                  <ListItemButton
                    key={song.id}
                    sx={{ pl: 4 }}
                    selected={index === currentIndex}
                    onClick={() => playIndex(index)}
                  >
                    <ListItemText primary={`${index + 1}. ${song.title}`} secondary={song.artist} />
                  </ListItemButton>
                ))}
              </List>
            </Collapse>

            <ListItemButton onClick={() => setPresetsOpen((open) => !open)}>
              <ListItemText primary="Presets" />
              {presetsOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </ListItemButton>
            <Collapse in={presetsOpen} timeout="auto" unmountOnExit>
              <List disablePadding>
                {PRESETS.map((p) => (
                  <ListItemButton
                    key={p.id}
                    sx={{ pl: 4 }}
                    selected={p.id === presetId}
                    onClick={() => setPresetId(p.id)}
                  >
                    <ListItemText primary={p.name} />
                  </ListItemButton>
                ))}
              </List>
            </Collapse>
          </List>

          <Box sx={{ p: 2 }}>
            <Button component="label" variant="contained" fullWidth>
              Add music files
              <input type="file" accept="audio/*" multiple hidden onChange={handleUpload} />
            </Button>
          </Box>
        </Box>
      </Drawer>

      {notice && noticeSong && (
        <Snackbar
          open
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
          autoHideDuration={notice.kind === "converted" ? 8000 : null}
          onClose={(_, reason) => {
            if (reason === "clickaway" || notice.kind === "converting") return;
            dismissNotice();
          }}
        >
          {notice.kind === "unsupported" ? (
            <Alert
              severity="warning"
              variant="filled"
              action={
                <>
                  <Button color="inherit" size="small" onClick={() => handleConvert(notice.songId)}>
                    Convert to MP3
                  </Button>
                  {closeButton}
                </>
              }
            >
              &ldquo;{noticeSong.title}&rdquo; can&apos;t play in this browser.
            </Alert>
          ) : notice.kind === "converting" ? (
            <Alert severity="info" variant="filled" sx={{ minWidth: 320 }}>
              Converting &ldquo;{noticeSong.title}&rdquo;
              {notice.progress === null
                ? " (loading converter, first time only)…"
                : ` ${Math.round(notice.progress * 100)}%`}
              <LinearProgress
                color="inherit"
                variant={notice.progress === null ? "indeterminate" : "determinate"}
                value={(notice.progress ?? 0) * 100}
                sx={{ mt: 1 }}
              />
            </Alert>
          ) : notice.kind === "converted" ? (
            <Alert
              severity="success"
              variant="filled"
              action={
                <>
                  <Button
                    color="inherit"
                    size="small"
                    component="a"
                    href={noticeSong.src}
                    download={`${noticeSong.title}.mp3`}
                  >
                    Download
                  </Button>
                  {closeButton}
                </>
              }
            >
              &ldquo;{noticeSong.title}&rdquo; converted to MP3.
            </Alert>
          ) : (
            <Alert severity="error" variant="filled" onClose={dismissNotice}>
              Couldn&apos;t convert &ldquo;{noticeSong.title}&rdquo;. Check the browser console for details.
            </Alert>
          )}
        </Snackbar>
      )}
    </div>
  );
}