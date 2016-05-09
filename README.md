# Babylon-navigation-mesh

[![NPM version](https://badge.fury.io/js/babylon-navigation-mesh.png)](http://badge.fury.io/js/babylon-navigation-mesh)

[Demo](http://wanadev.github.io/babylon-navigation-mesh/)

A toolkit to navigate on a mesh with BABYLON.js. Largely inspired by [PatrolJS](https://github.com/nickjanssen/PatrolJS) for ThreeJS.

Babylon-navigation-mesh is a path finder for AI agents. It use the A star and  Funnel algorithms to calculate a path on a navigation mesh.

## Usage

Add the npm package [babylon-navigation-mesh](https://www.npmjs.com/package/babylon-navigation-mesh) to your project:

    npm install babylon-navigation-mesh --save

or clone:

    git clone git@github.com:wanadev/babylon-navigation-mesh.git

then 

	var Navigation = require("babylon-navigation-mesh");

And create your object and the associated graph:
	
```javascript 
var navigation = new Navigation();
var scene = engine.scene;

var navmesh = scene.getMeshByName("Navmesh");
var zoneNodes = navigation.buildNodes(navmesh);
navigation.setZoneData('scene', zoneNodes);
```

To calculate the path : 

```javascript 
var zone = navigation.getGroup('scene', agentPosition);
var path = navigation.findPath(agentPosition, dest, 'scene', zone);
```
And to project a position on the navmesh: 

```javascript 
var newPosition = navigation.projectOnNavmesh(this.position, 'scene', navigation.getGroup('level', this.position));
```

An article is available to create and use a navigation mesh [here](https://www.wanadev.fr/43-tuto-creer-et-utiliser-un-maillage-de-navigation-avec-babylon-js/) (french)

## Demo

![](https://github.com/wanadev/babylon-navigation-mesh/blob/master/demo/demo.gif?raw=true)
