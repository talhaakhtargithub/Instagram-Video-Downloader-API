const express = require("express");
const app = express();
const snapsave = require("./snapsave-downloader/src/index");
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const port = 3000;

app.use(express.json());

app.get("/", (req, res) => {
    res.json({ message: "Hello World!" });
});

// Download Endpoint
app.get("/igdl", async (req, res) => {
    try {
        const url = req.query.url;

        if (!url) {
            return res.status(400).json({ error: "URL parameter is missing" });
        }

        const downloadedURL = await snapsave(url);
        res.json({ url: downloadedURL });
    } catch (err) {
        console.error("Error:", err.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Metadata Logic
/**
 * Extract metadata from Instagram Reel URL
 * @param {string} reelUrl - Instagram Reel URL
 * @returns {Promise<Object>} Reel metadata
 */
async function getReelMetadata(reelUrl) {
    try {
        // Add ?__a=1&__d=dis to get JSON response
        const url = reelUrl.includes('?')
            ? `${reelUrl}&__a=1&__d=dis`
            : `${reelUrl}?__a=1&__d=dis`;

        let response;
        try {
            response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                }
            });
        } catch (err) {
            console.log('JSON endpoint failed, trying fallback to HTML...');
            response = await axios.get(reelUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                }
            });
        }

        // Try to parse as JSON first (if we got the JSON response)
        if (typeof response.data === 'object' && (response.data.items || response.data.graphql)) {
            const mediaData = response.data.items?.[0] || response.data.graphql?.shortcode_media;

            if (mediaData) {
                return extractMetadata(mediaData);
            }
        }

        // Fallback: Parse HTML
        const $ = cheerio.load(response.data);
        const scriptTag = $('script[type="application/ld+json"]').html();

        if (scriptTag) {
            const jsonData = JSON.parse(scriptTag);
            return {
                url: reelUrl,
                caption: jsonData.caption || jsonData.description,
                uploadDate: jsonData.uploadDate,
                interactionCount: jsonData.interactionStatistic?.userInteractionCount,
                author: jsonData.author?.name,
                thumbnailUrl: jsonData.thumbnailUrl,
                contentUrl: jsonData.contentUrl
            };
        }

        // Fallback 2: Parse Meta Tags
        const metaTags = {
            title: $('meta[property="og:title"]').attr('content'),
            description: $('meta[property="og:description"]').attr('content'),
            image: $('meta[property="og:image"]').attr('content'),
            url: $('meta[property="og:url"]').attr('content'),
            type: $('meta[property="og:type"]').attr('content'),
            site_name: $('meta[property="og:site_name"]').attr('content')
        };

        if (metaTags.title || metaTags.description) {
            return {
                url: metaTags.url || reelUrl,
                caption: metaTags.description, // Description often contains the caption
                author: metaTags.title ? metaTags.title.split(' on Instagram')[0] : null, // "User on Instagram: ..."
                thumbnailUrl: metaTags.image,
                contentUrl: metaTags.url,
                source: 'meta_tags'
            };
        }

        throw new Error('Could not extract metadata');

    } catch (error) {
        return { error: error.message };
    }
}

function extractMetadata(media) {
    return {
        id: media.id,
        shortcode: media.shortcode,
        caption: media.edge_media_to_caption?.edges?.[0]?.node?.text || media.caption?.text,
        likes: media.edge_media_preview_like?.count || media.like_count,
        comments: media.edge_media_to_comment?.count || media.comment_count,
        videoUrl: media.video_url,
        videoViewCount: media.video_view_count || media.play_count,
        displayUrl: media.display_url,
        owner: {
            username: media.owner?.username,
            id: media.owner?.id,
            profilePic: media.owner?.profile_pic_url
        },
        timestamp: media.taken_at_timestamp || media.taken_at,
        isVideo: media.is_video,
        hashtags: extractHashtags(media.edge_media_to_caption?.edges?.[0]?.node?.text || ''),
    };
}

function extractHashtags(caption) {
    const hashtagRegex = /#[\w\u0590-\u05ff]+/g;
    return caption.match(hashtagRegex) || [];
}

// Metadata Endpoint
app.get('/api/metadata', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    console.log(`Fetching metadata for: ${url}`);
    const metadata = await getReelMetadata(url);

    if (metadata.error) {
        return res.status(500).json(metadata);
    }

    res.json(metadata);
});

// Combined Endpoint
app.get('/api/info', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    console.log(`Fetching combined info for: ${url}`);

    try {
        const [metadata, downloadInfo] = await Promise.all([
            getReelMetadata(url),
            snapsave(url)
        ]);

        let videoData = {};
        if (downloadInfo.data && Array.isArray(downloadInfo.data) && downloadInfo.data.length > 0) {
            videoData = downloadInfo.data[0];
        }

        const response = {
            ...metadata,
            ...downloadInfo,
            thumbnail: videoData.thumbnail || metadata.thumbnailUrl,
            downloadUrl: videoData.url
        };

        // Remove the original data array and redundant fields
        delete response.data;
        delete response.thumbnailUrl;

        res.json([response]);
    } catch (err) {
        console.error("Error in combined endpoint:", err.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
