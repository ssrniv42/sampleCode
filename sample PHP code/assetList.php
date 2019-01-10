<?php
//Track24 2013
//Author : Steven Crawford
//Co Author : Jing Guan - Masoud Omran
//G.U.I v2.5
//Asset List PER Group Mechanics

session_start(); include $_SESSION['SYSCON_URL'];
					
	$owner = $_SESSION['SESS_CLIENT_ID'];
	
	if($_SESSION['SESS_ACCOUNT_TYPE']=='client'){
		// modified by Jing to get comm_id from comms table
		$qry_grp_AssetList= "SELECT * FROM assets INNER JOIN comms ON comms.table_name = 'assets' AND comms.row_id = assets.ats_id WHERE assets.cl_id ='".$owner."'";
			
	}else{
		$user_id= $_SESSION['USR_USER_ID'];
		// modified by Jing to get comm_id from comms table
		$qry_grp_AssetList = "SELECT * FROM assets
											INNER JOIN comms 
											ON comms.table_name = 'assets' AND comms.row_id = assets.ats_id
											INNER JOIN groups_assets
											ON assets.ats_id= groups_assets.asset_id
											INNER JOIN user_group_perms
											ON groups_assets.group_id= user_group_perms.group_id AND assets.cl_id=user_group_perms.client_id																						
											WHERE user_group_perms.user_id='".$user_id."' AND assets.cl_id = '". $owner ."'";
		
	}
	
	if(isset($_GET['dType'])){
		$qry_grp_AssetList = $qry_grp_AssetList." AND assets.device_type = '". $_GET['dType'] ."'";
	}
	
	 $qry_grp_AssetList= $qry_grp_AssetList." GROUP BY assets.ats_id";
	
	$result_grp_AssetList = mysql_query($qry_grp_AssetList);
	$result = array();
	$status = array();
	
	if($result_grp_AssetList){
		while($row = mysql_fetch_array($result_grp_AssetList, MYSQL_ASSOC)){
			$result[] = $row;
			
		}//end while
	}
	
	if(!$result_grp_AssetList){
		array_push($status , array('error'=>'Failed to get asset list !'));
		array_push($status , array('debug'=>'Failed to get asset list ! SQL error : '.mysql_error()));
	}
	
	echo json_encode(array("result" => $result, "status" => $status));
	exit();
?>