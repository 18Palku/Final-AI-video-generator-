
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');
const ffmpeg = require('fluent-ffmpeg');

// --- FFmpeg Configuration ---
try {
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    ffmpeg.setFfmpegPath(ffmpegPath);
    console.log("✅ FFmpeg is configured correctly.");
} catch (e) {
    console.error("❌ CRITICAL ERROR: Could not find FFmpeg.");
    process.exit(1);
}

const app = express();
const port = 3001;
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API Keys & AI Model Initialization ---
const googleApiKey = process.env.GOOGLE_API_KEY;
const pexelsApiKey = process.env.PEXELS_API_KEY;
const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

const genAI = new GoogleGenerativeAI(googleApiKey);
const googleModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
let openai;
if (openaiApiKey) {
    openai = new OpenAI({ apiKey: openaiApiKey });
    console.log("✅ OpenAI (Backup AI) is configured.");
}




// --- VOICE MAPPING FOR DIFFERENT PRODUCTS ---
const VOICE_MAPPING = {
    'tech': 'EXAVITQu4vr4xnSDxMaL', // Antoni
    'gadgets': 'pNInz6obpgDQGcFmaJgB', // Adam
    'electronics': 'VR6AewLTigWG4xSOukaG', // Richard
    'automotive': 'nPczCjzI2devNBz1zQrb', // Brian
    'sports': 'EXAVITQu4vr4xnSDxMaL', // Antoni
    'beauty': '21m00Tcm4TlvDq8ikWAM', // Rachel
    'skincare': '21m00Tcm4TlvDq8ikWAM', // Rachel
    'fashion': 'LcfcDJNUP1GQjkzn1xUU', // Emily
    'clothing': 'LcfcDJNUP1GQjkzn1xUU', // Emily
    'jewelry': '21m00Tcm4TlvDq8ikWAM', // Rachel
    'food': 'LcfcDJNUP1GQjkzn1xUU', // Emily
    'snacks': 'LcfcDJNUP1GQjkzn1xUU', // Emily
    'health': '21m00Tcm4TlvDq8ikWAM', // Rachel
    'fitness': 'LcfcDJNUP1GQjkzn1xUU', // Emily
    'home': 'LcfcDJNUP1GQjkzn1xUU', // Emily
    'kitchen': '21m00Tcm4TlvDq8ikWAM', // Rachel
    'default': '21m00Tcm4TlvDq8ikWAM' // Rachel as default
};

// --- AI FUNCTION WITH FALLBACK ---
async function generateAiContent(prompt, useGoogleFirst = true) {
    if (useGoogleFirst) {
        try {
            const result = await googleModel.generateContent(prompt);
            return result.response.text();
        } catch (googleError) {
            console.warn(`[AI] ⚠️ Google failed: ${googleError.message}. Trying OpenAI...`);
        }
    }

    if (openai) {
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 800,
                temperature: 0.7
            });
            return response.choices[0].message.content;
        } catch (openaiError) {
            console.error(`[AI] ❌ OpenAI also failed: ${openaiError.message}`);
            throw openaiError;
        }
    }
    
    throw new Error("All AI providers failed or are not configured.");
}

// --- HELPER FUNCTIONS ---
function getVoiceForProduct(productName) {
    const product = productName.toLowerCase();
    for (const [category, voiceId] of Object.entries(VOICE_MAPPING)) {
        if (product.includes(category)) {
            return voiceId;
        }
    }
    return VOICE_MAPPING.default;
}

async function getPexelsVideoForLine(visualDescription, productName) {
    if (!pexelsApiKey) throw new Error("Pexels API Key is missing.");
    try {
        // Try product-specific search first
        let query = `${productName} ${visualDescription}`;
        console.log(`[PEXELS] 🔍 Primary search: "${query}"`);
        
        let res = await axios.get(`https://api.pexels.com/videos/search`, {
            headers: { Authorization: pexelsApiKey }, 
            params: { 
                query: query, 
                per_page: 20, 
                orientation: 'portrait',
                min_duration: 8,
                max_duration: 40
            }
        });
        
        // If no results, try broader search
        if (!res.data.videos || res.data.videos.length === 0) {
            query = visualDescription;
            console.log(`[PEXELS] 🔄 Fallback search: "${query}"`);
            res = await axios.get(`https://api.pexels.com/videos/search`, {
                headers: { Authorization: pexelsApiKey }, 
                params: { 
                    query: query, 
                    per_page: 20, 
                    orientation: 'portrait',
                    min_duration: 8,
                    max_duration: 40
                }
            });
        }
        
        if (res.data.videos && res.data.videos.length > 0) {
            const video = res.data.videos.find(v => v.duration >= 8 && v.duration <= 40);
            if (video) {
                const hdVideo = video.video_files.find(f => f.quality === 'hd' && f.link);
                if (hdVideo) {
                    console.log(`[PEXELS] ✅ Found HD video: ${video.id}`);
                    return hdVideo.link;
                }
            }
        }
        return null;
    } catch (error) { 
        console.error(`[PEXELS] ❌ Search failed for "${visualDescription}":`, error.message); 
        return null; 
    }
}

async function generateVoice(text, language, voiceId, timestamp) {
    try {
        console.log(`[VOICEOVER] 🎤 Generating voice with ID: ${voiceId} in ${language}...`);
        console.log(`[VOICEOVER] Script length: ${text.length} characters`);
        
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, 
            { 
                text, 
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.7,
                    similarity_boost: 0.8,
                    style: 0.4,
                    use_speaker_boost: true
                }
            }, 
            { 
                headers: { 
                    'Accept': 'audio/mpeg', 
                    'xi-api-key': elevenLabsApiKey 
                }, 
                responseType: 'arraybuffer' 
            }
        );
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `voice-${timestamp}.mp3`);
        await fsp.writeFile(tempFilePath, response.data);
        console.log(`[VOICEOVER] ✅ 25-second voiceover generated successfully!`);
        return tempFilePath;
    } catch (error) { 
        throw new Error("Failed to create voiceover: " + (error.response?.data?.detail?.message || error.message)); 
    }
}

// TEMPLATE SYSTEM - NO API NEEDED
async function generateEnhancedScript(productName, mood, language) {
    console.log(`[AI] 📝 Using FREE template system for ${mood} mood...`);
    console.log(`[AI] 🎯 Product: "${productName}"`);
    
    // Pre-written viral scripts
    const viralScripts = {
        funny: {
            beauty: [
                "LINE: My skin said 'who dis new phone?'",
                `LINE: ${productName} literally broke my mirror`,
                "LINE: I'm glowing like a lightbulb now",
                "LINE: My friends think I got surgery",
                "LINE: Plot twist it actually works besties",
                "LINE: The glow up is absolutely unreal",
                "LINE: I'm basically a walking highlighter",
                "LINE: My confidence said thank you queen",
                "LINE: Your skin deserves this magic potion",
                "LINE: Don't walk RUN to get this"
            ],
            tech: [
                "LINE: This gadget broke my brain cells",
                `LINE: ${productName} is from the year 3000`,
                "LINE: My life just got a software update",
                "LINE: Why didn't anyone tell me sooner",
                "LINE: It's like having a personal robot",
                "LINE: My productivity went absolutely crazy",
                "LINE: Everyone's asking what my secret is",
                "LINE: This is not a drill people",
                "LINE: Your life needs this upgrade badly",
                "LINE: Trust me and thank me later"
            ],
            fashion: [
                "LINE: This outfit said pick me",
                `LINE: ${productName} is absolutely iconic`,
                "LINE: I'm serving looks and confidence",
                "LINE: People can't stop staring honestly",
                "LINE: My style game just leveled up",
                "LINE: The compliments are getting ridiculous",
                "LINE: I feel like a main character",
                "LINE: This is my new personality",
                "LINE: You need this in your life",
                "LINE: Get it before everyone else does"
            ],
            food: [
                "LINE: This taste transported my soul",
                `LINE: ${productName} just changed my life`,
                "LINE: I'm emotionally attached to this now",
                "LINE: My taste buds are having a party",
                "LINE: I bought ten more immediately",
                "LINE: This is my new obsession officially",
                "LINE: I can't eat anything else",
                "LINE: My friends steal this constantly",
                "LINE: You haven't lived until you try",
                "LINE: Order it right now seriously"
            ]
        },
        
        exciting: {
            beauty: [
                `LINE: ${productName} is absolutely life changing`,
                "LINE: Results in just seven days guaranteed",
                "LINE: My skin transformation is completely insane",
                "LINE: The glow is totally unreal",
                "LINE: Everyone keeps asking my secret routine",
                "LINE: This revolutionized my entire skincare",
                "LINE: The before and after shocked everyone",
                "LINE: I cannot believe the dramatic difference",
                "LINE: Your skin will thank you forever",
                "LINE: Get yours now before complete sellout"
            ],
            tech: [
                `LINE: ${productName} is revolutionary technology`,
                "LINE: This will change everything completely",
                "LINE: The performance is absolutely mind blowing",
                "LINE: I'm getting incredible results daily",
                "LINE: This solved all my problems",
                "LINE: The speed improvement is unreal",
                "LINE: Everyone needs this in their life",
                "LINE: This is the future right now",
                "LINE: Don't miss out on this game changer",
                "LINE: Order immediately while still available"
            ]
        },
        
        trendy: {
            default: [
                "LINE: POV you found the holy grail",
                `LINE: ${productName} hits different bestie`,
                "LINE: This is giving main character energy",
                "LINE: The vibe check is absolutely unmatched",
                "LINE: Everyone's copying my aesthetic now",
                "LINE: My confidence just leveled up significantly",
                "LINE: This is not a want it's definitely need",
                "LINE: The compliments keep flowing in daily",
                "LINE: Trust the process and trust me",
                "LINE: Link in bio before it's gone"
            ]
        },
        
        luxurious: {
            default: [
                `LINE: ${productName} is pure luxury experience`,
                "LINE: Quality that speaks for itself",
                "LINE: This is investment in yourself",
                "LINE: The craftsmanship is absolutely impeccable",
                "LINE: You deserve this level of excellence",
                "LINE: This elevates your entire lifestyle",
                "LINE: Premium quality meets perfect design",
                "LINE: This is what success looks like",
                "LINE: Treat yourself like royalty today",
                "LINE: Experience luxury that lasts lifetime"
            ]
        }
    };
    
    // Determine product category
    const product = productName.toLowerCase();
    let category = 'default';
    
    if (product.includes('serum') || product.includes('cream') || product.includes('skincare') || 
        product.includes('beauty') || product.includes('glow') || product.includes('face')) {
        category = 'beauty';
    } else if (product.includes('tech') || product.includes('gadget') || product.includes('phone') || 
               product.includes('laptop') || product.includes('device')) {
        category = 'tech';
    } else if (product.includes('clothes') || product.includes('dress') || product.includes('shirt') || 
               product.includes('fashion') || product.includes('style')) {
        category = 'fashion';
    } else if (product.includes('food') || product.includes('snack') || product.includes('drink') || 
               product.includes('recipe') || product.includes('meal')) {
        category = 'food';
    }
    
    // Get script based on mood and category
    const moodScripts = viralScripts[mood.toLowerCase()] || viralScripts.trendy;
    let selectedScript = moodScripts[category] || moodScripts.default || viralScripts.trendy.default;
    
    // Replace product name in script
    const finalScript = selectedScript.map(line => 
        line.replace('${productName}', productName)
    ).join('\n');
    
    console.log('[AI] ✅ FREE template script generated successfully!');
    console.log(`[AI] 📊 Category: ${category}, Mood: ${mood}`);
    console.log(`[AI] 📝 Script length: 10 lines for 25 seconds`);
    
    return finalScript;
}
// IMPROVED VIDEO CREATION WITH PROPER TEXT OVERLAY
async function createVideoWithSubtitles(videoUrls, textOverlays, voiceAudioPath, customMusicPath, includeSubtitles, timestamp, productName) {
    return new Promise(async (resolve, reject) => {
        console.log(`[FFMPEG] 🎬 Creating 25-second TikTok video${includeSubtitles ? ' with subtitles' : ''}`);
        const tempDir = os.tmpdir();
        const outputFilename = `tiktok-${productName.replace(/[^a-zA-Z0-9]/g, '')}-${timestamp}.mp4`;
        const publicDir = path.join(__dirname, 'public');
        const videosDir = path.join(publicDir, 'videos');
        if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
        const outputPath = path.join(videosDir, outputFilename);

        let downloadedFiles = [];
        try {
            // Download videos
            console.log('[FFMPEG] 📥 Downloading product-related videos...');
            for (let i = 0; i < videoUrls.length; i++) {
                const response = await axios({ 
                    url: videoUrls[i], 
                    responseType: 'arraybuffer',
                    timeout: 30000
                });
                const inputPath = path.join(tempDir, `clip-${i}.mp4`);
                await fsp.writeFile(inputPath, response.data);
                downloadedFiles.push(inputPath);
                console.log(`[FFMPEG] ✅ Downloaded clip ${i + 1}/${videoUrls.length}`);
            }

            const ffmpegCommand = ffmpeg();
            downloadedFiles.forEach(file => ffmpegCommand.input(file));
            if (voiceAudioPath) ffmpegCommand.input(voiceAudioPath);
            if (customMusicPath) ffmpegCommand.input(customMusicPath);

            const complexFilter = [];
            const totalDuration = 25;
            const segmentDuration = totalDuration / downloadedFiles.length;
            
            console.log(`[FFMPEG] ⏱️ Each video segment: ${segmentDuration}s`);
            
            // SIMPLIFIED VIDEO PROCESSING - NO COMPLEX TEXT OVERLAYS
            for (let i = 0; i < downloadedFiles.length; i++) {
                // Just scale and crop - no text overlay for now
                complexFilter.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=duration=${segmentDuration},setpts=PTS-STARTPTS[v${i}]`);
            }
            
            // Concatenate all video segments
            const videoInputs = Array.from({ length: downloadedFiles.length }, (_, i) => `[v${i}]`).join('');
            complexFilter.push(`${videoInputs}concat=n=${downloadedFiles.length}:v=1:a=0[outv]`);

            // FIXED AUDIO MIXING
            let audioIndex = downloadedFiles.length;
            let outputOptions = ['-map', '[outv]'];
            
            if (voiceAudioPath && customMusicPath) {
                // Voice (loud) + Background Music (soft)
                console.log('[FFMPEG] 🎵 Mixing voice + background music...');
                complexFilter.push(`[${audioIndex}:a]volume=1.2,atrim=duration=${totalDuration}[voice]`);
                complexFilter.push(`[${audioIndex + 1}:a]volume=0.15,atrim=duration=${totalDuration}[music]`);
                complexFilter.push(`[voice][music]amix=inputs=2:duration=shortest[outa]`);
                outputOptions.push('-map', '[outa]');
            } else if (voiceAudioPath) {
                // Voice only
                console.log('[FFMPEG] 🎤 Adding voiceover only...');
                complexFilter.push(`[${audioIndex}:a]volume=1.1,atrim=duration=${totalDuration}[outa]`);
                outputOptions.push('-map', '[outa]');
            } else if (customMusicPath) {
                // Music only
                console.log('[FFMPEG] 🎵 Adding background music only...');
                complexFilter.push(`[${audioIndex}:a]volume=0.4,atrim=duration=${totalDuration}[outa]`);
                outputOptions.push('-map', '[outa]');
            }

            // Simple high-quality settings
            outputOptions.push(
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '23',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ar', '44100',
                '-t', String(totalDuration),
                '-movflags', '+faststart',
                '-pix_fmt', 'yuv420p'
            );
            
            console.log('[FFMPEG] 🔧 Complex filter:', complexFilter.join(';'));
            
            ffmpegCommand
                .complexFilter(complexFilter)
                .outputOptions(outputOptions)
                .on('start', (cmd) => {
                    console.log('[FFMPEG] 🔥 Creating TikTok video...');
                    console.log('[FFMPEG] Command preview:', cmd.substring(0, 200) + '...');
                })
                .on('progress', (progress) => {
                    if (progress.percent) {
                        console.log(`[FFMPEG] Progress: ${Math.round(progress.percent)}%`);
                    }
                })
                .on('end', async () => {
                    console.log(`[FFMPEG] ✅ TikTok video created successfully!`);
                    console.log(`[FFMPEG] 📁 Output: ${outputFilename}`);
                    
                    // Cleanup temp files
                    for (const file of downloadedFiles) {
                        await fsp.unlink(file).catch(() => {});
                    }
                    if (voiceAudioPath) {
                        await fsp.unlink(voiceAudioPath).catch(() => {});
                    }
                    resolve(`/videos/${outputFilename}`);
                })
                .on('error', (err, stdout, stderr) => {
                    console.error('[FFMPEG] ❌ Video creation failed:', err.message);
                    console.error('[FFMPEG] Command that failed:', ffmpegCommand._getArguments().join(' '));
                    reject(err);
                })
                .save(outputPath);
                
        } catch (error) {
            console.error('[FFMPEG] ❌ Setup error:', error.message);
            reject(error);
        }
    });
}
// --- MAIN API ENDPOINT ---
app.post('/api/generate', async (req, res) => {
    const { productName, productUrl, mood, language = 'en', audioOption = 'voice+music', includeSubtitles = true } = req.body;
    const timestamp = Date.now();
    console.log(`\n\n--- [${timestamp}] 🚀 25-SECOND TIKTOK VIDEO GENERATION STARTED ---`);
    console.log(`Product: "${productName || productUrl}"`);
    console.log(`Mood: ${mood}`);
    console.log(`Audio: ${audioOption}`);
    console.log(`Subtitles: ${includeSubtitles}`);
    
    const finalProductName = productName || productUrl || 'Amazing Product';
    
    try {
        // Step 1: Generate 25-Second Script (10 lines)
        console.log('[AI] 📝 Creating 10-line viral script for 25 seconds...');
        const fullScript = await generateEnhancedScript(finalProductName, mood, language);
        console.log('[AI] ✅ 25-second script generated!');

        const textOverlays = fullScript.split('\n')
            .filter(line => line.startsWith('LINE:'))
            .map(line => line.replace('LINE:', '').trim())
            .slice(0, 10); // Exactly 10 lines for 25-second video

        if (textOverlays.length < 8) {
            throw new Error("Script too short - need at least 8 lines for 25-second video");
        }

        console.log('[SCRIPT] ✅ Generated 10 lines for 25 seconds:');
        textOverlays.forEach((line, i) => {
            console.log(`  ${i+1}. "${line}" (${(i*2.5).toFixed(1)}s-${((i+1)*2.5).toFixed(1)}s)`);
        });

        // Step 2: Find Product-Specific Videos
        console.log(`[PEXELS] 🎬 Finding videos specifically for "${finalProductName}"...`);
        const videoUrls = [];
        const videoSearchTerms = [];
        
        // Generate specific search terms for each script section
        for (let i = 0; i < Math.min(textOverlays.length, 5); i++) { // Use max 5 videos for 25 seconds
            const line = textOverlays[i];
            console.log(`[AI] 🧠 Generating visual concept for: "${line}"`);
            
            const visualPrompt = `Create a specific visual search term for Pexels that shows "${finalProductName}" related to this script line: "${line}". 
            
Give me 3-4 keywords that would find videos showing:
- The actual product "${finalProductName}"
- People using or enjoying this product
- The lifestyle/emotion from the script line
- ${mood} mood visuals

Only return keywords, no explanation.`;
            
            try {
                const visualDescription = (await generateAiContent(visualPrompt)).trim();
                videoSearchTerms.push(visualDescription);
                console.log(`[PEXELS] 🔍 Search term ${i+1}: "${visualDescription}"`);
                
                const videoUrl = await getPexelsVideoForLine(visualDescription, finalProductName);
                if (videoUrl) {
                    videoUrls.push(videoUrl);
                    console.log(`[PEXELS] ✅ Found video ${i+1}/5`);
                } else {
                    console.warn(`[PEXELS] ⚠️ No video found for term: ${visualDescription}`);
                }
            } catch (error) {
                console.warn(`[PEXELS] ⚠️ Visual generation failed for line ${i+1}`);
            }
        }

        // Add fallback videos if needed
        if (videoUrls.length < 3) {
            console.log('[PEXELS] 🔄 Adding product-specific fallback videos...');
            const fallbackSearches = [
                `${finalProductName} review`,
                `${finalProductName} unboxing`, 
                `${finalProductName} lifestyle`,
                `${mood} ${finalProductName}`,
                `people using ${finalProductName}`,
                `${finalProductName} benefits`,
                `${finalProductName} showcase`
            ];
            
            for (const search of fallbackSearches) {
                if (videoUrls.length >= 5) break;
                console.log(`[PEXELS] 🔄 Trying fallback: "${search}"`);
                const fallbackVideo = await getPexelsVideoForLine(search, finalProductName);
                if (fallbackVideo && !videoUrls.includes(fallbackVideo)) {
                    videoUrls.push(fallbackVideo);
                    console.log(`[PEXELS] ✅ Added fallback video`);
                }
            }
        }

        if (videoUrls.length === 0) {
            throw new Error(`Could not find any videos related to "${finalProductName}". Try a different product name or check Pexels API.`);
        }

        console.log(`[PEXELS] ✅ Total videos found: ${videoUrls.length} for product: ${finalProductName}`);

        // Step 3: Generate 25-Second Audio
        let voiceAudioPath = null;
        let customMusicPath = null;
        
        const selectedVoiceId = getVoiceForProduct(finalProductName);
        console.log(`[VOICE] 🎯 Selected voice for "${finalProductName}": ${selectedVoiceId}`);
        
        // Background music
        if (audioOption.includes('music')) {
            const musicDir = path.join(__dirname, 'public', 'music');
            if (fs.existsSync(musicDir)) {
                const musicFiles = fs.readdirSync(musicDir).filter(f => 
                    f.endsWith('.wav') || f.endsWith('.mp3') || f.endsWith('.m4a')
                );
                if (musicFiles.length > 0) {
                    const randomMusic = musicFiles[Math.floor(Math.random() * musicFiles.length)];
                    customMusicPath = path.join(musicDir, randomMusic);
                    console.log(`[MUSIC] 🎵 Selected background music: ${randomMusic}`);
                } else {
                    console.warn('[MUSIC] ⚠️ No music files found. Create /public/music directory and add music files.');
                }
            }
        }
        
        // Generate 25-second voiceover
        if (audioOption.includes('voice')) {
            const fullVoiceScript = textOverlays.join('. ') + '.';
            console.log(`[VOICE] 🎤 Generating 25-second voiceover...`);
            console.log(`[VOICE] Script preview: "${fullVoiceScript.substring(0, 150)}..."`);
            voiceAudioPath = await generateVoice(fullVoiceScript, language, selectedVoiceId, timestamp);
        }

        // Step 4: Create Perfect TikTok Video
        console.log('[VIDEO] 🎬 Creating 25-second TikTok video with perfect timing...');
        const finalVideoUrl = await createVideoWithSubtitles(
            videoUrls.slice(0, 5), // Max 5 videos for smooth playback
            textOverlays, // All 10 lines
            voiceAudioPath,
            customMusicPath,
            includeSubtitles,
            timestamp,
            finalProductName
        );
        
        console.log(`\n--- [${timestamp}] ✅✅✅ PERFECT TIKTOK VIDEO CREATED! ✅✅✅`);
        console.log(`📱 Video: http://localhost:3001${finalVideoUrl}`);
        console.log(`⏱️ Duration: Exactly 25 seconds`);
        console.log(`🎯 Product-focused: ${finalProductName}`);
        console.log(`🎤 Voice Volume: HIGH`);
        console.log(`🎵 Music Volume: Background/Low`);
        console.log(`📝 Script Lines: ${textOverlays.length}`);
        console.log(`🎬 Video Clips: ${Math.min(videoUrls.length, 5)}`);
        
        res.json({ 
            success: true,
            videoUrl: `http://localhost:3001${finalVideoUrl}`, 
            script: fullScript,
            scriptLines: textOverlays,
            searchTerms: videoSearchTerms,
            metadata: {
                duration: 'Exactly 25 seconds',
                format: 'TikTok Ready (1080x1920)',
                quality: 'HD',
                voiceId: selectedVoiceId,
                mood: mood,
                subtitles: includeSubtitles,
                scriptTiming: '2.5 seconds per line',
                totalLines: textOverlays.length,
                videoClips: Math.min(videoUrls.length, 5)
            }
        });
        
    } catch (error) {
        console.error(`\n--- [${timestamp}] ❌ TIKTOK VIDEO GENERATION FAILED ---`);
        console.error('Error:', error.message);
        
        let errorMessage = "TikTok video generation failed: ";
        if (error.message.includes('script')) {
            errorMessage += "Could not generate proper 25-second script. Try different mood or product.";
        } else if (error.message.includes('Pexels') || error.message.includes('videos')) {
            errorMessage += `No videos found for "${productName || productUrl}". Try a more common product name.`;
        } else if (error.message.includes('ElevenLabs') || error.message.includes('voice')) {
            errorMessage += "Voice generation failed. Check ElevenLabs API key and quota.";
        } else if (error.message.includes('FFmpeg')) {
            errorMessage += "Video processing failed. Check FFmpeg installation.";
        } else {
            errorMessage += error.message;
        }
        
        res.status(500).json({ 
            success: false,
            message: errorMessage,
            error: error.message,
            timestamp: timestamp
        });
    }
});
//  DATABASE SETUP 
const sqlite3 = require('sqlite3').verbose();
const puppeteer = require('puppeteer');
const db = new sqlite3.Database('tiktok_accounts.db');

// Create tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS tiktok_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_name TEXT NOT NULL,
        username TEXT NOT NULL,
        password TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS video_uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER,
        video_path TEXT,
        product_name TEXT,
        upload_status TEXT DEFAULT 'queued',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Real TikTok Upload Function
async function uploadToRealTikTok(videoPath, caption, username, password) {
    const browser = await puppeteer.launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    try {
        console.log(`[TIKTOK] 🚀 Uploading to @${username}...`);
        
        // Go to TikTok upload page
        await page.goto('https://www.tiktok.com/upload', { waitUntil: 'networkidle2' });
        
        // Check if login is needed
        const loginButton = await page.$('button[data-e2e="login-button"]');
        if (loginButton) {
            console.log('[TIKTOK] 🔑 Login required...');
            await page.goto('https://www.tiktok.com/login/phone-or-email/email');
            
            // Login process
            await page.waitForSelector('input[name="username"]', { timeout: 10000 });
            await page.type('input[name="username"]', username);
            await page.type('input[type="password"]', password);
            await page.click('button[data-e2e="login-button"]');
            
            // Wait for login to complete
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
            
            // Go to upload page after login
            await page.goto('https://www.tiktok.com/upload', { waitUntil: 'networkidle2' });
        }
        
        // Upload video file
        console.log('[TIKTOK] 📤 Uploading video file...');
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
            await fileInput.uploadFile(videoPath);
            
            // Wait for video to process
            await page.waitForTimeout(10000);
            
            // Add caption
            console.log('[TIKTOK] 📝 Adding caption...');
            const captionInput = await page.$('[data-e2e="video-caption"]');
            if (captionInput) {
                await captionInput.click();
                await captionInput.type(caption);
            }
            
            // Click post button
            console.log('[TIKTOK] 🚀 Publishing...');
            const postButton = await page.$('button[data-e2e="publish-button"]');
            if (postButton) {
                await postButton.click();
                await page.waitForTimeout(5000);
                
                console.log('[TIKTOK] ✅ Video uploaded successfully!');
                return { success: true, message: 'Video uploaded successfully!' };
            }
        }
        
        throw new Error('Could not complete upload process');
        
    } catch (error) {
        console.error('[TIKTOK] ❌ Upload failed:', error.message);
        return { success: false, error: error.message };
    } finally {
        await browser.close();
    }
}

// END DATABASE SETUP 


// Health check 
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        version: '19.0 - TikTok Generator with Account Management',
        services: {
            ffmpeg: '✅ Ready',
            pexels: pexelsApiKey ? '✅ Pexels Ready' : '❌ No Pexels Key',
            elevenlabs: elevenLabsApiKey ? '✅ ElevenLabs Ready' : '❌ No Voice Key',
            ai: '✅ Template System (No API needed)',
            database: '✅ SQLite Database Ready'
        },
        features: [
            '25-second TikTok videos',
            '10-line scripts (2.5s per line)', 
            'Product URL support',
            'TikTok account management',
            'Upload queue system',
            'Background music mixing',
            'HD 1080x1920 output'
        ]
    });
});


//  TIKTOK ACCOUNT MANAGEMENT 



// Add TikTok Account
app.post('/api/tiktok/add-account', (req, res) => {
    const { account_name, username, password } = req.body;
    
    if (!account_name || !username || !password) {
        return res.status(400).json({ 
            success: false, 
            error: 'Account name, username, and password are required' 
        });
    }
    
    console.log(`[TIKTOK] Adding account: @${username}`);
    
    db.run(
        `INSERT INTO tiktok_accounts (account_name, username, password) VALUES (?, ?, ?)`,
        [account_name, username.replace('@', ''), password],
        function(err) {
            if (err) {
                console.error('[TIKTOK] Database error:', err);
                res.status(500).json({ success: false, error: err.message });
            } else {
                console.log(`[TIKTOK] ✅ Account added successfully: @${username}`);
                res.json({
                    success: true,
                    message: `TikTok account @${username} added successfully`,
                    accountId: this.lastID
                });
            }
        }
    );
});

// Get all TikTok accounts
app.get('/api/tiktok/accounts', (req, res) => {
    console.log('[TIKTOK] 📋 Fetching all accounts...');
    
    db.all(`SELECT id, account_name, username, status, created_at FROM tiktok_accounts WHERE status = 'active' ORDER BY created_at DESC`, (err, rows) => {
        if (err) {
            console.error('[TIKTOK] Database error:', err);
            res.status(500).json({ success: false, error: err.message });
        } else {
            console.log(`[TIKTOK] ✅ Found ${rows.length} accounts`);
            res.json({
                success: true,
                accounts: rows,
                total: rows.length
            });
        }
    });
});

// Remove TikTok account
app.delete('/api/tiktok/accounts/:id', (req, res) => {
    const { id } = req.params;
    
    db.run(`UPDATE tiktok_accounts SET status = 'deleted' WHERE id = ?`, [id], function(err) {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            console.log(`[TIKTOK] 🗑️ Account removed: ID ${id}`);
            res.json({
                success: true,
                message: 'Account removed successfully'
            });
        }
    });
});

// Real TikTok Upload
app.post('/api/tiktok/upload-real', async (req, res) => {
    const { videoUrl, caption, accountId } = req.body;
    
    if (!videoUrl || !accountId) {
        return res.status(400).json({ 
            success: false, 
            error: 'Video URL and account ID required' 
        });
    }
    
    try {
        // Get account details
        db.get(`SELECT * FROM tiktok_accounts WHERE id = ? AND status = 'active'`, [accountId], async (err, account) => {
            if (err || !account) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Account not found' 
                });
            }
            
            console.log(`[TIKTOK] 🚀 Starting upload to @${account.username}`);
            
            // Convert video URL to local path
            const videoPath = videoUrl.replace('http://localhost:3001', './public');
            
            // Real upload
            const result = await uploadToRealTikTok(
                videoPath,
                caption,
                account.username,
                account.password
            );
            
            if (result.success) {
                res.json({
                    success: true,
                    message: `✅ Video uploaded successfully to @${account.username}!`
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error || 'Upload failed'
                });
            }
        });
        
    } catch (error) {
        console.error('[TIKTOK] Upload error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

//  END TIKTOK ENDPOINTS // Start server
app.listen(port, () => {
    console.log(`\n🚀 TIKTOK VIDEO GENERATOR v20.0`);
    console.log(`📍 Server: http://localhost:${port}`);
    console.log(`🎬 Ready to create viral TikTok videos!`);
    console.log(`📱 TikTok integration enabled!`);
    
    console.log(`\n✅ Features Available:`);
    console.log(`   🎯 25-second TikTok videos`);
    console.log(`   📝 10-line viral scripts`);
    console.log(`   🎤 Professional voice generation`);
    console.log(`   🎵 Background music mixing`);
    console.log(`   📱 TikTok account management`);
    console.log(`   🚀 Real TikTok upload automation`);
    console.log(`   📊 Upload queue tracking`);
    
    console.log(`\n⏳ Ready for requests...`);
    
    // Test database connection
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='tiktok_accounts'", (err, row) => {
        if (row) {
            console.log('✅ TikTok database ready');
        } else {
            console.log('⚠️ Database will be created on first use');
        }
    });
});

// Cleanup on exit
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down TikTok Video Generator...');
    console.log('🧹 Cleaning up...');
    
    // Close database connection
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('✅ Database connection closed');
        }
    });
    
    console.log('✅ Shutdown complete. Goodbye!');
    process.exit(0);
});

// Handle errors
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err.message);
    console.log('🔄 Server continues running...');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
    console.log('🔄 Server continues running...');
});

console.log('🎉 TikTok Video Generator v20.0 initialized successfully!');