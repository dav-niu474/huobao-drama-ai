// ============================================================
// Art Prompt Loader
// Reads art skill files from data/skills/art_skills/{styleName}/
// and story skill files from data/skills/story_skills/
// ============================================================

import fs from 'fs'
import path from 'path'

// Base directories
const ART_SKILLS_DIR = path.join(process.cwd(), 'data', 'skills', 'art_skills')
const STORY_SKILLS_DIR = path.join(process.cwd(), 'data', 'skills', 'story_skills')

// ============================================================
// Types
// ============================================================

export interface ArtStyleInfo {
  key: string
  name: string
  description: string
  thumbnailUrl: string | null
}

export interface StorySkillInfo {
  key: string
  name: string
  description: string
}

// ============================================================
// Prompt type mapping
// ============================================================

const PROMPT_TYPE_MAP: Record<string, string> = {
  art_character: 'art_prompt/art_character.md',
  art_character_derivative: 'art_prompt/art_character_derivative.md',
  art_scene: 'art_prompt/art_scene.md',
  art_scene_derivative: 'art_prompt/art_scene_derivative.md',
  art_prop: 'art_prompt/art_prop.md',
  art_prop_derivative: 'art_prompt/art_prop_derivative.md',
  art_storyboard_video: 'art_prompt/art_storyboard_video.md',
}

// ============================================================
// getArtPrompt — Get a specific prompt for a style
// ============================================================

export function getArtPrompt(styleName: string, promptType: string): string {
  const styleDir = path.join(ART_SKILLS_DIR, styleName)

  // Validate style exists
  if (!fs.existsSync(styleDir)) {
    throw new Error(`Art style "${styleName}" not found`)
  }

  // Read prefix.md (auto-prepend)
  const prefixPath = path.join(styleDir, 'prefix.md')
  let prefix = ''
  if (fs.existsSync(prefixPath)) {
    prefix = fs.readFileSync(prefixPath, 'utf-8')
  }

  // Map promptType to file path
  const relativePath = PROMPT_TYPE_MAP[promptType]
  if (!relativePath) {
    throw new Error(
      `Unknown prompt type: "${promptType}". Valid types: ${Object.keys(PROMPT_TYPE_MAP).join(', ')}`
    )
  }

  const promptPath = path.join(styleDir, relativePath)
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${relativePath} for style "${styleName}"`)
  }

  const promptContent = fs.readFileSync(promptPath, 'utf-8')

  // Combine prefix + specific template
  return prefix ? `${prefix}\n\n---\n\n${promptContent}` : promptContent
}

// ============================================================
// getAllArtPrompts — Get all prompts for a style as key-value map
// ============================================================

export function getAllArtPrompts(styleName: string): Record<string, string> {
  const styleDir = path.join(ART_SKILLS_DIR, styleName)

  if (!fs.existsSync(styleDir)) {
    throw new Error(`Art style "${styleName}" not found`)
  }

  // Read prefix
  const prefixPath = path.join(styleDir, 'prefix.md')
  let prefix = ''
  if (fs.existsSync(prefixPath)) {
    prefix = fs.readFileSync(prefixPath, 'utf-8')
  }

  const artPromptDir = path.join(styleDir, 'art_prompt')
  const result: Record<string, string> = {}

  if (!fs.existsSync(artPromptDir)) {
    return result
  }

  const files = fs.readdirSync(artPromptDir).filter((f) => f.endsWith('.md'))

  for (const file of files) {
    const key = file.replace('.md', '') // e.g., "art_character"
    const content = fs.readFileSync(path.join(artPromptDir, file), 'utf-8')
    result[key] = prefix ? `${prefix}\n\n---\n\n${content}` : content
  }

  return result
}

// ============================================================
// getArtStyleList — List all available art styles with metadata
// ============================================================

export function getArtStyleList(): ArtStyleInfo[] {
  if (!fs.existsSync(ART_SKILLS_DIR)) {
    return []
  }

  const styleDirs = fs
    .readdirSync(ART_SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  const styles: ArtStyleInfo[] = []

  for (const dirName of styleDirs) {
    const readmePath = path.join(ART_SKILLS_DIR, dirName, 'README.md')
    let name = dirName
    let description = ''

    if (fs.existsSync(readmePath)) {
      const readmeContent = fs.readFileSync(readmePath, 'utf-8')
      // Extract name from first heading: # Some Name
      const nameMatch = readmeContent.match(/^#\s+(.+)$/m)
      if (nameMatch) {
        name = nameMatch[1].trim()
      }
      // Extract description from the first paragraph after the heading
      const lines = readmeContent.split('\n')
      let descLines: string[] = []
      let pastHeading = false
      for (const line of lines) {
        if (line.startsWith('#') && !pastHeading) {
          pastHeading = true
          continue
        }
        if (pastHeading && line.trim() && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('---')) {
          descLines.push(line.trim())
          if (descLines.length >= 2) break // Take first 2 non-empty lines
        }
      }
      description = descLines.join(' ').slice(0, 200)
    }

    // Check for thumbnail in images/ directory
    const imagesDir = path.join(ART_SKILLS_DIR, dirName, 'images')
    let thumbnailUrl: string | null = null
    if (fs.existsSync(imagesDir)) {
      const imageFiles = fs.readdirSync(imagesDir)
      // Look for the first image file
      const firstImage = imageFiles.find((f) =>
        /\.(png|jpg|jpeg|webp|gif)$/i.test(f)
      )
      if (firstImage) {
        thumbnailUrl = `/api/files/art_skills/${dirName}/images/${firstImage}`
      }
    }

    styles.push({
      key: dirName,
      name,
      description,
      thumbnailUrl,
    })
  }

  return styles
}

// ============================================================
// getStorySkillList — List all available story skills
// ============================================================

export function getStorySkillList(): StorySkillInfo[] {
  if (!fs.existsSync(STORY_SKILLS_DIR)) {
    return []
  }

  const skillDirs = fs
    .readdirSync(STORY_SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  const skills: StorySkillInfo[] = []

  for (const dirName of skillDirs) {
    const readmePath = path.join(STORY_SKILLS_DIR, dirName, 'README.md')
    let name = dirName
    let description = ''

    if (fs.existsSync(readmePath)) {
      const readmeContent = fs.readFileSync(readmePath, 'utf-8')
      // Extract name from first heading
      const nameMatch = readmeContent.match(/^#\s+(.+)$/m)
      if (nameMatch) {
        name = nameMatch[1].trim()
      }
      // Extract description
      const lines = readmeContent.split('\n')
      let descLines: string[] = []
      let pastHeading = false
      for (const line of lines) {
        if (line.startsWith('#') && !pastHeading) {
          pastHeading = true
          continue
        }
        if (pastHeading && line.trim() && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('---')) {
          descLines.push(line.trim())
          if (descLines.length >= 2) break
        }
      }
      description = descLines.join(' ').slice(0, 200)
    }

    skills.push({
      key: dirName,
      name,
      description,
    })
  }

  return skills
}

// ============================================================
// validateArtStyle — Check if an art style exists
// ============================================================

export function validateArtStyle(styleName: string): boolean {
  const styleDir = path.join(ART_SKILLS_DIR, styleName)
  return fs.existsSync(styleDir) && fs.statSync(styleDir).isDirectory()
}
