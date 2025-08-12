// NOTE UTILITIES AND TAG MANAGEMENT (CLIENT-SIDE)

export interface NoteTag {
  id: string;
  note_id: string;
  tag_name: 'account' | 'team' | 'priority' | 'status';
  tag_value: string;
  created_at: string;
}

export interface NoteTags {
  account?: string;
  team?: string;
  priority?: string;
  status?: string;
}

// CONVERT ARRAY OF TAGS TO OBJECT FORMAT
export function tagsArrayToObject(tags: NoteTag[]): NoteTags {
  const tagObject: NoteTags = {};
  tags.forEach(tag => {
    tagObject[tag.tag_name] = tag.tag_value;
  });
  return tagObject;
}

// CONVERT OBJECT TO ARRAY FORMAT FOR API
export function tagsObjectToArray(tags: NoteTags): Omit<NoteTag, 'id' | 'note_id' | 'created_at'>[] {
  return Object.entries(tags)
    .filter(([_, value]) => value && value.trim() !== '')
    .map(([tag_name, tag_value]) => ({
      tag_name: tag_name as 'account' | 'team' | 'priority' | 'status',
      tag_value: tag_value!.trim()
    }));
}

// GET TAG COLOR BY CATEGORY
export function getTagColor(tagName: string): string {
  switch (tagName) {
    case 'account': return 'bg-blue-500';
    case 'team': return 'bg-green-500';
    case 'priority': return 'bg-yellow-500';
    case 'status': return 'bg-purple-500';
    default: return 'bg-slate-500';
  }
}

// GET TAG DISPLAY NAME
export function getTagDisplayName(tagName: string): string {
  switch (tagName) {
    case 'account': return 'ACCOUNT';
    case 'team': return 'TEAM';
    case 'priority': return 'PRIORITY';
    case 'status': return 'STATUS';
    default: return tagName.toUpperCase();
  }
} 