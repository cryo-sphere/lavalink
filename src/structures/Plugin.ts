import { Manager } from "./Manager";

/** The plugin class you extend to create your own */
export abstract class Plugin {
	/** The manager that loaded this plugin */
	public manager!: Manager;

	/**
	 * Called when plugin is loaded
	 * @param manager
	 * @example public init(manager: Manager) {
			this.manager = manager;
		}
	 */
	public init(manager: Manager): void {
		this.manager = manager;
	}
}
