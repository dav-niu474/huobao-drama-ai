'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore, type Character } from '@/lib/store'
import { api } from '@/lib/api'
import { CharacterBible } from '@/components/character-bible'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Users, ChevronRight } from 'lucide-react'

export function CharacterBibleView() {
  const selectedDramaId = useAppStore((s) => s.selectedDramaId)
  const navigateToProject = useAppStore((s) => s.navigateToProject)
  const currentDrama = useAppStore((s) => s.currentDrama)

  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchCharacters = useCallback(async () => {
    if (!selectedDramaId) return
    setLoading(true)
    try {
      const result = await api.characters.list(selectedDramaId)
      setCharacters(result)
      if (result.length > 0 && !selectedCharId) {
        setSelectedCharId(result[0].id)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [selectedDramaId])

  useEffect(() => {
    fetchCharacters()
  }, [fetchCharacters])

  if (!selectedDramaId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">请先选择一个项目</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Top Bar */}
      <div className="h-12 border-b border-border flex items-center px-4 gap-3 shrink-0">
        <button
          onClick={() => selectedDramaId && navigateToProject(selectedDramaId)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate max-w-32"
        >
          {currentDrama?.title || '项目'}
        </button>
        <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
        <div className="flex items-center gap-1.5">
          <Users className="size-4 text-amber-500" />
          <span className="text-sm font-medium">角色圣经</span>
        </div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-2">
          {characters.length} 角色
        </Badge>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex">
        {/* Character List */}
        <div className="w-56 border-r border-border/50 overflow-y-auto shrink-0">
          <div className="p-2 space-y-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : characters.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="size-6 mx-auto mb-2 opacity-30" />
                <p className="text-xs">暂无角色数据</p>
                <p className="text-[10px] mt-1">请先完成资产提取</p>
              </div>
            ) : (
              characters.map((char) => (
                <button
                  key={char.id}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all text-xs ${
                    selectedCharId === char.id
                      ? 'bg-primary/10 text-primary border border-primary/30'
                      : 'hover:bg-muted/50 border border-transparent'
                  }`}
                  onClick={() => setSelectedCharId(char.id)}
                >
                  <div className="size-7 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-500 font-bold text-[10px]">
                    {char.name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{char.name}</p>
                    <p className="text-[10px] text-muted-foreground">{char.role}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Bible Content */}
        <div className="flex-1 min-w-0 overflow-y-auto p-4">
          {selectedCharId && selectedDramaId ? (
            <CharacterBible characterId={selectedCharId} dramaId={selectedDramaId} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">选择一个角色查看角色圣经</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
