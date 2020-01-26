declare const enum Edge {
    top = 0,
    bottom = 1,
    left = 2,
    right = 3
}

type World_Grid<T extends Cell_Like> = Grid<T> & {
    world_origin: XYZ
}

const color_nothing = rgb(255, 255, 255);
const color_green = rgb(128, 255, 128);
const color_red = rgb(255, 128, 128);
const color_yellow = rgb(255, 255, 0);

function world_position_to_battle_position(world_origin: XY, position: XYZ): XY {
    return {
        x: Math.floor((position.x - world_origin.x) / Const.battle_cell_size),
        y: Math.floor((position.y - world_origin.y) / Const.battle_cell_size)
    }
}

function battle_position_to_world_position_center(world_origin: XYZ, position: XY): XYZ {
    return {
        x: world_origin.x + position.x * Const.battle_cell_size + Const.battle_cell_size / 2,
        y: world_origin.y + position.y * Const.battle_cell_size + Const.battle_cell_size / 2,
        z: world_origin.z
    }
}

function create_cell_particle_at(position: XYZ) {
    const particle = Particles.CreateParticle("particles/ui/square_overlay.vpcf", ParticleAttachment_t.PATTACH_CUSTOMORIGIN, 0);

    Particles.SetParticleControl(particle, 0, xyz_to_array(position));
    Particles.SetParticleControl(particle, 1, [Const.battle_cell_size / 2, 0, 0]);
    Particles.SetParticleControl(particle, 2, [255, 255, 255]);
    Particles.SetParticleControl(particle, 3, [50, 0, 0]);

    return particle;
}

function update_outline<T extends Cell_Like>(grid: World_Grid<T>, storage: ParticleId[], cell_index_to_highlight: boolean[], color: RGB): ParticleId[] {
    for (const old_particle of storage) {
        Particles.DestroyParticleEffect(old_particle, false);
        Particles.ReleaseParticleIndex(old_particle);
    }

    if (cell_index_to_highlight.length > 0) {
        const result = highlight_outline(grid, cell_index_to_highlight, color);

        for (const particle of result) {
            register_particle_for_reload(particle);
        }

        return result;
    } else {
        return [];
    }
}

function create_particle_for_outline_edge(edge: Edge, world_origin: XYZ, start: XY, finish: XY, color: RGB) {
    const fx = Particles.CreateParticle("particles/ui/highlight_rope.vpcf", ParticleAttachment_t.PATTACH_CUSTOMORIGIN, 0);
    const half = Const.battle_cell_size / 2;
    const height = 32;

    register_particle_for_reload(fx);

    const fr = battle_position_to_world_position_center(world_origin, start);
    const to = battle_position_to_world_position_center(world_origin, finish);

    switch (edge) {
        case Edge.bottom: {
            Particles.SetParticleControl(fx, 0, [fr.x - half, fr.y - half, fr.z + height]);
            Particles.SetParticleControl(fx, 1, [to.x + half, to.y - half, to.z + height]);

            break;
        }

        case Edge.top: {
            Particles.SetParticleControl(fx, 0, [fr.x + half, fr.y + half, fr.z + height]);
            Particles.SetParticleControl(fx, 1, [to.x - half, to.y + half, to.z + height]);

            break;
        }

        case Edge.left: {
            Particles.SetParticleControl(fx, 0, [fr.x - half, fr.y + half, fr.z + height]);
            Particles.SetParticleControl(fx, 1, [to.x - half, to.y - half, to.z + height]);

            break;
        }

        case Edge.right: {
            Particles.SetParticleControl(fx, 0, [fr.x + half, fr.y - half, fr.z + height]);
            Particles.SetParticleControl(fx, 1, [to.x + half, to.y + half, to.z + height]);

            break;
        }
    }

    Particles.SetParticleControl(fx, 2, color);

    return fx;
}

function highlight_outline_temporarily<T extends Cell_Like>(grid: World_Grid<T>, cell_index_to_highlight: boolean[], color: RGB, highlight_time: number) {
    const particles = highlight_outline(grid, cell_index_to_highlight, color);

    $.Schedule(highlight_time, () => {
        for (const particle of particles) {
            Particles.DestroyParticleEffect(particle, false);
            Particles.ReleaseParticleIndex(particle);
        }
    });
}

function highlight_outline<T extends Cell_Like>(grid: World_Grid<T>, cell_index_to_highlight: boolean[], color: RGB): ParticleId[] {
    const cell_index_to_edges: Array<{ edge: Edge, from: XY, to: XY, deleted: boolean }[]> = [];
    const unique_edges: { edge: Edge, from: XY, to: XY, deleted: boolean }[] = [];

    function merge_edges(at: XY, going_towards: Edge, right_relative: number | undefined, left_relative: number | undefined, index: number) {
        const right_neighbor = right_relative != undefined && cell_index_to_edges[right_relative];
        const right_edge = right_neighbor && right_neighbor.find(old => old.edge == going_towards);
        const left_neighbor = left_relative != undefined && cell_index_to_edges[left_relative];
        const left_edge = left_neighbor && left_neighbor.find(old => old.edge == going_towards);

        if (right_edge && left_edge) {
            right_edge.to = left_edge.to;
            left_edge.deleted = true;
            cell_index_to_edges[index].push(right_edge);
        } else {
            if (right_edge) {
                right_edge.to = at;
                cell_index_to_edges[index].push(right_edge);
            }

            if (left_edge) {
                left_edge.from = at;
                cell_index_to_edges[index].push(left_edge);
            }
        }

        if (!right_edge && !left_edge) {
            const new_edge = { edge: going_towards, from: at, to: at, deleted: false };
            cell_index_to_edges[index].push(new_edge);
            unique_edges.push(new_edge);
        }
    }

    for (let index = 0; index < cell_index_to_highlight.length; index++) {
        const is_highlighted = cell_index_to_highlight[index];

        if (!is_highlighted) continue;

        const cell = grid.cells[index];
        const at = cell.position;

        const right = grid_cell_index_raw(grid, at.x + 1, at.y);
        const left = grid_cell_index_raw(grid, at.x - 1, at.y);
        const top = grid_cell_index_raw(grid, at.x, at.y + 1);
        const bottom = grid_cell_index_raw(grid, at.x, at.y - 1);

        const edge_side_right_left: [Edge, number | undefined, number | undefined, number | undefined][] = [
            [ Edge.top, top, right, left ],
            [ Edge.bottom, bottom, left, right ],
            [ Edge.right, right, bottom, top ],
            [ Edge.left, left, top, bottom ]
        ];

        for (const [ edge, side, right, left ] of edge_side_right_left) {
            if (side == undefined || !cell_index_to_highlight[side]) {
                if (!cell_index_to_edges[index]) {
                    cell_index_to_edges[index] = [];
                }

                merge_edges(at, edge, right, left, index);
            }
        }
    }

    const particles: ParticleId[] = [];

    for (const { edge, from, to, deleted } of unique_edges) {
        if (deleted) continue;

        const fx = create_particle_for_outline_edge(edge, grid.world_origin, from, to, color);

        particles.push(fx);
    }

    return particles;
}