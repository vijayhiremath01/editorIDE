import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const useTimelineStore = create(
  persist(
    (set, get) => ({
      // Timeline state
      timeline: {
        tracks: [
          { id: 'video-1', type: 'video', clips: [], locked: false, muted: false },
          { id: 'audio-1', type: 'audio', clips: [], locked: false, muted: false },
          { id: 'text-1', type: 'text', clips: [], locked: false, muted: false }
        ],
        duration: 0,
        fps: 30
      },
      currentTime: 0,
      selectedClip: null,
      selectedTrack: null,
      scale: 100, // pixels per second
      snapGrid: 1, // seconds
      projectId: 'default',
      
      // Actions
      setCurrentTime: (time) => set({ currentTime: time }),
      
      setScale: (scale) => set({ scale }),
      
      setSnapGrid: (grid) => set({ snapGrid: grid }),
      
      addTrack: (type) => {
        const trackId = `${type}-${get().timeline.tracks.length + 1}`
        const newTrack = {
          id: trackId,
          type,
          clips: [],
          locked: false,
          muted: false
        }
        set((state) => ({
          timeline: {
            ...state.timeline,
            tracks: [...state.timeline.tracks, newTrack]
          }
        }))
        return newTrack
      },
      
      addClip: (trackId, clip) => {
        set((state) => {
          const tracks = state.timeline.tracks.map(track => {
            if (track.id === trackId) {
              return {
                ...track,
                clips: [...track.clips, clip]
              }
            }
            return track
          })
          
          // Update duration
          let maxEnd = 0
          tracks.forEach(track => {
            track.clips.forEach(clip => {
              if (clip.end > maxEnd) {
                maxEnd = clip.end
              }
            })
          })
          
          return {
            timeline: {
              ...state.timeline,
              tracks,
              duration: maxEnd
            }
          }
        })
      },

      moveClip: (clipId, fromTrackId, toTrackId, newStart, newEnd) => {
        set((state) => {
          let movedClip = null
          const tracksAfterRemoval = state.timeline.tracks.map(track => {
            if (track.id === fromTrackId) {
              const remaining = track.clips.filter(c => c.id !== clipId)
              const clip = track.clips.find(c => c.id === clipId)
              movedClip = clip ? { ...clip, start: newStart, end: newEnd } : null
              return { ...track, clips: remaining }
            }
            return track
          })

          const tracks = tracksAfterRemoval.map(track => {
            if (track.id === toTrackId && movedClip) {
              return { ...track, clips: [...track.clips, movedClip] }
            }
            return track
          })

          // Update duration
          let maxEnd = 0
          tracks.forEach(track => {
            track.clips.forEach(clip => {
              if (clip.end > maxEnd) {
                maxEnd = clip.end
              }
            })
          })

          return {
            timeline: { ...state.timeline, tracks, duration: maxEnd },
            selectedClip: movedClip || state.selectedClip,
            selectedTrack: toTrackId
          }
        })
      },
      
      updateClip: (trackId, clipId, updates) => {
        set((state) => {
          const tracks = state.timeline.tracks.map(track => {
            if (track.id === trackId) {
              return {
                ...track,
                clips: track.clips.map(clip => {
                  if (clip.id === clipId) {
                    return { ...clip, ...updates }
                  }
                  return clip
                })
              }
            }
            return track
          })
          
          // Update duration
          let maxEnd = 0
          tracks.forEach(track => {
            track.clips.forEach(clip => {
              if (clip.end > maxEnd) {
                maxEnd = clip.end
              }
            })
          })
          
          return {
            timeline: {
              ...state.timeline,
              tracks,
              duration: maxEnd
            }
          }
        })
      },
      
      removeClip: (trackId, clipId) => {
        set((state) => {
          const tracks = state.timeline.tracks.map(track => {
            if (track.id === trackId) {
              return {
                ...track,
                clips: track.clips.filter(c => c.id !== clipId)
              }
            }
            return track
          })
          
          // Update duration
          let maxEnd = 0
          tracks.forEach(track => {
            track.clips.forEach(clip => {
              if (clip.end > maxEnd) {
                maxEnd = clip.end
              }
            })
          })
          
          return {
            timeline: {
              ...state.timeline,
              tracks,
              duration: maxEnd
            },
            selectedClip: state.selectedClip?.id === clipId ? null : state.selectedClip
          }
        })
      },

      toggleTrackMute: (trackId) => {
        set((state) => {
          const tracks = state.timeline.tracks.map(track => {
            if (track.id === trackId) {
              return { ...track, muted: !track.muted }
            }
            return track
          })
          return { timeline: { ...state.timeline, tracks } }
        })
      },

      toggleTrackHidden: (trackId) => {
        set((state) => {
          const tracks = state.timeline.tracks.map(track => {
            if (track.id === trackId) {
              return { ...track, hidden: !track.hidden }
            }
            return track
          })
          return { timeline: { ...state.timeline, tracks } }
        })
      },
      
      selectClip: (clip, trackId) => {
        set({
          selectedClip: clip,
          selectedTrack: trackId
        })
      },
      
      clearSelection: () => {
        set({
          selectedClip: null,
          selectedTrack: null
        })
      },
      
      setTimeline: (timeline) => {
        set({ timeline })
      },
      
      setProjectId: (projectId) => {
        set({ projectId })
      },

      // Split the currently selected clip at provided time
      splitSelectedClipAt: (time) => {
        const state = get()
        const { selectedClip, selectedTrack, timeline } = state
        if (!selectedClip || !selectedTrack) return
        const track = timeline.tracks.find(t => t.id === selectedTrack)
        if (!track) return
        const clip = track.clips.find(c => c.id === selectedClip.id || c.id === selectedClip)
        if (!clip) return
        const splitTime = Math.max(clip.start, Math.min(time, clip.end))
        if (splitTime <= clip.start || splitTime >= clip.end) return

        const left = { ...clip, id: `${clip.id}-L`, start: clip.start, end: splitTime }
        const right = { ...clip, id: `${clip.id}-R`, start: splitTime, end: clip.end }

        // Replace clip with two new segments
        const newTracks = timeline.tracks.map(t => {
          if (t.id === selectedTrack) {
            return {
              ...t,
              clips: t.clips.flatMap(c => c.id === clip.id ? [left, right] : [c])
            }
          }
          return t
        })

        // Also split linked audio clip if present
        const linkedId = clip.linkedId
        if (linkedId) {
          const audioTrack = timeline.tracks.find(t => t.type === 'audio')
          if (audioTrack) {
            const aClip = audioTrack.clips.find(c => c.id === linkedId)
            if (aClip && splitTime > aClip.start && splitTime < aClip.end) {
              const aLeft = { ...aClip, id: `${aClip.id}-L`, start: aClip.start, end: splitTime, linkedId: left.id }
              const aRight = { ...aClip, id: `${aClip.id}-R`, start: splitTime, end: aClip.end, linkedId: right.id }
              newTracks.forEach((t, idx) => {
                if (t.id === audioTrack.id) {
                  newTracks[idx] = {
                    ...t,
                    clips: t.clips.flatMap(c => c.id === aClip.id ? [aLeft, aRight] : [c])
                  }
                }
              })
            }
          }
        }

        // Update duration
        let maxEnd = 0
        newTracks.forEach(t => t.clips.forEach(c => { if (c.end > maxEnd) maxEnd = c.end }))

        set({
          timeline: { ...timeline, tracks: newTracks, duration: maxEnd },
          selectedClip: right, // select the right segment after split
        })
      }
    }),
    {
      name: 'timeline-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        timeline: state.timeline,
        projectId: state.projectId
      })
    }
  )
)

export default useTimelineStore

