// One map tool at a time: what a click on the map does (UI reimagine, owner 2026-11-13;
// windy/notes/ui-reimagine-2026-11.md §2.6). Plain functions so the rule can be unit-tested.

/** off = nothing new · waypoint = add waypoints at the end · place = pick the place for Port weather / Tides (one click) */
export type MapTool = 'off' | 'waypoint' | 'place';

export type ClickAction = 'pick' | 'insert' | 'append' | 'none';

/** The tool in force: picking a place wins over adding waypoints, and goes back to it after the one click */
export function toolFor(addWaypoints: boolean, pickingPlace: boolean): MapTool {
    return pickingPlace ? 'place' : addWaypoints ? 'waypoint' : 'off';
}

/**
 * What one click on the map does.
 * - Picking a place wins over everything: a click on a course line then picks the point and never changes the route.
 * - Else a click on a course line inserts a waypoint there, if that setting is on.
 * - Else, with "Add waypoints by clicking the map" on, it adds a waypoint at the end.
 */
export function clickAction(tool: MapTool, onLeg: boolean, legClickInserts: boolean): ClickAction {
    if (tool === 'place') return 'pick';
    if (onLeg && legClickInserts) return 'insert';
    return tool === 'waypoint' ? 'append' : 'none';
}

/** The words of the note shown on the map while a tool is on ('' = no note) */
export function toolNote(tool: MapTool): string {
    return tool === 'place' ? 'Click the place on the map (it does not add a waypoint)' : tool === 'waypoint' ? 'Click the map to add waypoints' : '';
}
