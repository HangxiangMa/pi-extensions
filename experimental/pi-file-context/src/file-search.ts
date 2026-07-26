import Fuse from "fuse.js/basic";

const SEARCH_THRESHOLD = 0.2;
const BASENAME_WEIGHT = 0.7;
const PATH_WEIGHT = 0.3;

interface ProjectFileEntry {
	path: string;
	basename: string;
}

export class ProjectFileSearch {
	private readonly files: readonly string[];
	private readonly index: Fuse<ProjectFileEntry>;

	constructor(files: readonly string[]) {
		this.files = [...files];
		this.index = new Fuse(
			this.files.map((path) => ({
				path,
				basename: path.slice(path.lastIndexOf("/") + 1),
			})),
			{
				keys: [
					{ name: "basename", weight: BASENAME_WEIGHT },
					{ name: "path", weight: PATH_WEIGHT },
				],
				ignoreLocation: true,
				threshold: SEARCH_THRESHOLD,
			},
		);
	}

	search(query: string): string[] {
		const normalizedQuery = query.trim();
		if (!normalizedQuery) return [...this.files];
		return this.index.search(normalizedQuery).map((result) => result.item.path);
	}
}
