import { jsxs, jsx } from "react/jsx-runtime";
import { useState, useRef, useEffect } from "react";
import { c as authedFetch, g as getSupabaseBrowserClient } from "./router-CSiXPOJe.js";
import "@tanstack/react-router";
import "@supabase/supabase-js";
import "lucide-react";
import "stripe";
import "node:fs/promises";
import "node:path";
import "zod";
import "node:crypto";
function NewsPostForm({ onPost }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [embedLinks, setEmbedLinks] = useState("");
  const [imageFiles, setImageFiles] = useState([]);
  const [videoFiles, setVideoFiles] = useState([]);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await authedFetch("/api/news-upload", { method: "POST", body: formData });
    if (!res.ok) {
      const data2 = await res.json();
      throw new Error(data2.error || "Upload failed");
    }
    const data = await res.json();
    return data.url;
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const finalImageUrls = imageUrl.split(",").map((item) => item.trim()).filter(Boolean);
    const finalVideoUrls = videoUrl.split(",").map((item) => item.trim()).filter(Boolean);
    const finalEmbedLinks = embedLinks.split("\n").map((item) => item.trim()).filter(Boolean);
    try {
      for (const file of imageFiles) {
        const uploadedUrl = await uploadFile(file);
        finalImageUrls.push(uploadedUrl);
      }
      for (const file of videoFiles) {
        const uploadedUrl = await uploadFile(file);
        finalVideoUrls.push(uploadedUrl);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setError(message);
      setLoading(false);
      return;
    }
    const res = await authedFetch("/api/news", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title,
        body,
        image_urls: finalImageUrls,
        video_urls: finalVideoUrls,
        embed_links: finalEmbedLinks
      })
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to publish blog post");
    } else {
      setTitle("");
      setBody("");
      setImageUrl("");
      setVideoUrl("");
      setEmbedLinks("");
      setImageFiles([]);
      setVideoFiles([]);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (videoInputRef.current) videoInputRef.current.value = "";
      if (onPost) onPost();
    }
    setLoading(false);
  };
  return /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "bg-zinc-800 p-6 rounded-lg mb-8", children: [
    /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold mb-4", children: "Write a Blog Post" }),
    error && /* @__PURE__ */ jsx("div", { className: "text-red-400 mb-2", children: error }),
    /* @__PURE__ */ jsx(
      "input",
      {
        className: "block w-full mb-2 p-2 rounded bg-zinc-900 text-zinc-100",
        placeholder: "Title",
        value: title,
        onChange: (e) => setTitle(e.target.value),
        required: true
      }
    ),
    /* @__PURE__ */ jsx(
      "textarea",
      {
        className: "block w-full mb-2 p-2 rounded bg-zinc-900 text-zinc-100",
        placeholder: "Body",
        value: body,
        onChange: (e) => setBody(e.target.value),
        rows: 4,
        required: true
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: "mb-2", children: [
      /* @__PURE__ */ jsx("label", { className: "block text-zinc-400 mb-1", children: "Photo files (optional):" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "file",
          accept: "image/*",
          multiple: true,
          ref: imageInputRef,
          onChange: (e) => {
            const files = Array.from(e.target.files || []);
            setImageFiles(files);
          },
          className: "block w-full mb-1 p-2 rounded bg-zinc-900 text-zinc-100"
        }
      ),
      imageFiles.length > 0 ? /* @__PURE__ */ jsxs("p", { className: "mb-2 text-xs text-zinc-400", children: [
        imageFiles.length,
        " image file(s) selected"
      ] }) : null,
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "block w-full p-2 rounded bg-zinc-900 text-zinc-100",
          placeholder: "Additional image URLs (comma-separated)",
          value: imageUrl,
          onChange: (e) => {
            setImageUrl(e.target.value);
          },
          type: "text"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mb-2", children: [
      /* @__PURE__ */ jsx("label", { className: "block text-zinc-400 mb-1", children: "Video files (optional):" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "file",
          accept: "video/*",
          multiple: true,
          ref: videoInputRef,
          onChange: (e) => {
            const files = Array.from(e.target.files || []);
            setVideoFiles(files);
          },
          className: "block w-full mb-1 p-2 rounded bg-zinc-900 text-zinc-100"
        }
      ),
      videoFiles.length > 0 ? /* @__PURE__ */ jsxs("p", { className: "mb-2 text-xs text-zinc-400", children: [
        videoFiles.length,
        " video file(s) selected"
      ] }) : null,
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "block w-full p-2 rounded bg-zinc-900 text-zinc-100",
          placeholder: "Additional video URLs (comma-separated)",
          value: videoUrl,
          onChange: (e) => {
            setVideoUrl(e.target.value);
          },
          type: "text"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mb-4", children: [
      /* @__PURE__ */ jsx("label", { className: "block text-zinc-400 mb-1", children: "Links to embed (one URL per line)" }),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "block w-full p-2 rounded bg-zinc-900 text-zinc-100",
          rows: 3,
          placeholder: "https://youtube.com/...\\nhttps://x.com/...",
          value: embedLinks,
          onChange: (e) => setEmbedLinks(e.target.value)
        }
      )
    ] }),
    /* @__PURE__ */ jsx(
      "button",
      {
        type: "submit",
        className: "bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50",
        disabled: loading,
        children: loading ? "Publishing..." : "Publish Post"
      }
    )
  ] });
}
function isEmbeddableVideo(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes("youtube.com") || host === "youtu.be") return true;
    if (host.includes("vimeo.com")) return true;
    return false;
  } catch {
    return false;
  }
}
function toEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host.includes("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}
function NewsSection() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [canPost, setCanPost] = useState(false);
  const fetchPosts = async () => {
    setLoading(true);
    const response = await fetch("/api/news");
    const data = await response.json();
    if (response.ok && Array.isArray(data)) {
      setPosts(data);
    }
    setLoading(false);
  };
  useEffect(() => {
    void fetchPosts();
  }, []);
  useEffect(() => {
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data
        } = await supabase.auth.getSession();
        if (!data.session) {
          setCanPost(false);
          return;
        }
        const response = await authedFetch("/api/me/access");
        if (!response.ok) {
          setCanPost(false);
          return;
        }
        const access = await response.json();
        const allowedRoles = /* @__PURE__ */ new Set(["superadmin", "admin", "manager", "staff", "helper", "user"]);
        setCanPost(allowedRoles.has(access.role) && access.role !== "banned" && access.permissions.includes("view_creator_tools"));
      } catch {
        setCanPost(false);
      }
    })();
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "max-w-2xl mx-auto py-8", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold mb-6", children: "Blog" }),
    canPost && /* @__PURE__ */ jsx(NewsPostForm, { onPost: () => void fetchPosts() }),
    loading ? /* @__PURE__ */ jsx("div", { children: "Loading..." }) : posts.length === 0 ? /* @__PURE__ */ jsx("div", { children: "No blog posts yet." }) : /* @__PURE__ */ jsx("ul", { className: "space-y-8", children: posts.map((post) => /* @__PURE__ */ jsxs("li", { className: "bg-zinc-900 rounded-lg p-6 shadow", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-semibold mb-2", children: post.title }),
      /* @__PURE__ */ jsxs("div", { className: "text-zinc-400 text-sm mb-2", children: [
        "By ",
        post.author,
        " on ",
        new Date(post.created_at).toLocaleString()
      ] }),
      (post.image_urls || []).map((url) => /* @__PURE__ */ jsx("img", { src: url, alt: "Blog", className: "mb-4 rounded max-h-64 object-contain" }, url)),
      (post.video_urls || []).map((url) => /* @__PURE__ */ jsx("video", { src: url, controls: true, className: "mb-4 rounded max-h-96 w-full" }, url)),
      (post.embed_links || []).length > 0 ? /* @__PURE__ */ jsxs("div", { className: "mb-4 space-y-2 rounded-md border border-zinc-700 bg-zinc-950/60 p-3", children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs uppercase tracking-wide text-zinc-400", children: "Attached links" }),
        /* @__PURE__ */ jsx("ul", { className: "space-y-2 text-sm", children: (post.embed_links || []).map((link) => /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("a", { href: link, target: "_blank", rel: "noreferrer", className: "text-blue-300 hover:text-blue-200 underline break-all", children: link }),
          isEmbeddableVideo(link) ? /* @__PURE__ */ jsx("iframe", { src: toEmbedUrl(link) || link, className: "mt-2 h-52 w-full rounded border border-zinc-700", title: `Embedded media for ${post.title}`, loading: "lazy", allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture", allowFullScreen: true }) : null
        ] }, link)) })
      ] }) : null,
      /* @__PURE__ */ jsx("div", { className: "whitespace-pre-line text-zinc-200", children: post.body })
    ] }, post.id)) })
  ] });
}
export {
  NewsSection as component
};
