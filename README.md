[![NPM version](https://badge.fury.io/js/babylon-navigation-mesh.png)](http://badge.fury.io/js/babylon-navigation-mesh)
Babylon-navigation-mesh
=======
A toolkit to navigate on a mesh with BABYLON.js. Largely inspired by [PatrolJS](https://github.com/nickjanssen/PatrolJS) for ThreeJS.

Babylon-navigation-mesh is a path finder for AI agents. It use the A star and  Funnel algorithms to calculate a path on a navigation mesh.

##Usage##

Add the npm package [babylon-navigation-mesh](https://www.npmjs.com/package/babylon-navigation-mesh) to your project:

    npm install babylon-navigation-mesh --save

or clone:

    git clone git@github.com:wanadev/babylon-navigation-mesh.git

then 

	var Navigation = require("babylon-navigation-mesh");

And create your object and the associated graph:
	
    var navigation = new Navigation();
    var scene = engine.scene;
    
	var navmesh = scene.getMeshByName("Navmesh");
	var zoneNodes = navigation.buildNodes(navmesh);
	navigation.setZoneData('scene', zoneNodes);

To calculate the path : 

	var zone = navigation.getGroup('scene', agentPosition);
	var chemin = navigation.findPath(agentPosition, dest, 'scene', zone);

And to project a position on the navmesh: 

	var newPosition = navigation.projectOnNavmesh(this.position, 'scene', navigation.getGroup('level', this.position));

Article in progress

##Demo##

![](https://github.com/wanadev/babylon-navigation-mesh/blob/master/demo/demo.gif?raw=true)

